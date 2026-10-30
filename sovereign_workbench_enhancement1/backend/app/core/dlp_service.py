import re
import math
from typing import Tuple, List, Dict, Any
from app.core.logging import get_logger

logger = get_logger(__name__)

# Standard and industrial DLP sensitive patterns (Deterministic Rule Engine)
DLP_RULES = [
    (
        "AADHAAR_NUMBER",
        re.compile(r"\b[2-9]{1}\d{3}\s\d{4}\s\d{4}\b"),
        "[REDACTED PII: AADHAAR]",
    ),
    (
        "SSN",
        re.compile(r"\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"),
        "[REDACTED PII: SSN]",
    ),
    (
        "CREDIT_CARD",
        re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b"),
        "[REDACTED FINANCIAL: CARD]",
    ),
    (
        "PRIVATE_KEY",
        re.compile(r"-----BEGIN\s+[A-Z\s]+PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z\s]+PRIVATE\s+KEY-----"),
        "[REDACTED CRYPTO: PRIVATE KEY]",
    ),
    (
        "API_SECRET_KEY",
        re.compile(r"(?i)\b(api_key|apikey|secret_key|private_key|auth_token|bearer)\s*[:=]\s*['\"][A-Za-z0-9_\-\.]{12,}['\"]"),
        "[REDACTED CREDENTIAL: API KEY]",
    ),
    (
        "PASSWORD_ASSIGNMENT",
        re.compile(r"(?i)\b(password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{6,}['\"]"),
        "[REDACTED CREDENTIAL: PASSWORD]",
    ),
    (
        "PROPRIETARY_CATALYST_FORMULA",
        re.compile(r"(?i)\b(Apex-Cat-\d{3}|CrackingCatalyst-[A-Z0-9]+|formula\s*#\s*[A-Z0-9\-]+_secret)\b"),
        "[REDACTED INDUSTRIAL: PROPRIETARY FORMULA]",
    ),
    (
        "DATABASE_CONNECTION_URI",
        re.compile(r"(?i)\b(postgres|postgresql|mysql|mongodb|redis|oracle):\/\/[^:\s]+:[^@\s]+@[^\/\s]+(?::\d+)?\/[^\s]+"),
        "[REDACTED INFRASTRUCTURE: DB CONNECTION URI]",
    ),
]

# Semantic Contextual Patterns for ML/Heuristic Detection
SEMANTIC_PATTERNS = [
    (
        "CONFIDENTIAL_CHEMICAL_RATIO",
        re.compile(r"(?i)\b(?:Zeolite|Platinum|Palladium|Rhenium|Alumina)\s*[:=]?\s*\d{1,2}(?:\.\d+)?%\s*(?:wt|ratio|composition)?\b"),
        "[REDACTED INDUSTRIAL: PROPRIETARY COMPOSITION]",
    ),
    (
        "INTERNAL_SECURITY_TOKEN",
        re.compile(r"\b(?:eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b"),
        "[REDACTED CREDENTIAL: JWT TOKEN]",
    ),
]


def calculate_shannon_entropy(data: str) -> float:
    """Calculates the Shannon entropy of a string (bits per symbol)."""
    if not data:
        return 0.0
    entropy = 0.0
    length = len(data)
    counts = {}
    for char in data:
        counts[char] = counts.get(char, 0) + 1
    for count in counts.values():
        p_x = count / length
        if p_x > 0:
            entropy += -p_x * math.log2(p_x)
    return entropy


class DataLossPreventionService:
    @staticmethod
    def scan_and_redact(text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Scans text using both deterministic regex rules and ML/Entropy semantic heuristics.
        Returns (redacted_text, list_of_violations_found).
        """
        if not text:
            return text, []

        violations: List[Dict[str, Any]] = []
        redacted = text

        # 1. Deterministic Rule Matching
        for rule_name, pattern, placeholder in DLP_RULES:
            matches = list(pattern.finditer(redacted))
            if matches:
                for match in matches:
                    snippet = match.group(0)
                    violations.append({
                        "rule": rule_name,
                        "type": "REGEX_RULE",
                        "matched_length": len(snippet),
                        "placeholder": placeholder,
                    })
                redacted = pattern.sub(placeholder, redacted)

        # 2. Semantic Contextual Detection
        for sem_name, pattern, placeholder in SEMANTIC_PATTERNS:
            matches = list(pattern.finditer(redacted))
            if matches:
                for match in matches:
                    violations.append({
                        "rule": sem_name,
                        "type": "SEMANTIC_HEURISTIC",
                        "matched_length": len(match.group(0)),
                        "placeholder": placeholder,
                    })
                redacted = pattern.sub(placeholder, redacted)

        # 3. High-Entropy Unlabelled Token Detection (ML/Information Theory)
        words = redacted.split()
        high_entropy_tokens = []
        for word in words:
            clean_word = word.strip(" '\".,;:()[]{}")
            if len(clean_word) >= 20 and not clean_word.startswith("[REDACTED"):
                # Exclude purely standard words or paths
                if re.match(r"^[A-Za-z0-9_\-\+/=]{20,}$", clean_word):
                    entropy = calculate_shannon_entropy(clean_word)
                    if entropy >= 3.8:
                        high_entropy_tokens.append(clean_word)

        for token in set(high_entropy_tokens):
            violations.append({
                "rule": "HIGH_ENTROPY_CREDENTIAL",
                "type": "ML_ENTROPY_DETECTION",
                "matched_length": len(token),
                "placeholder": "[REDACTED UNFORMATTED SECRET]",
            })
            redacted = redacted.replace(token, "[REDACTED UNFORMATTED SECRET]")

        if violations:
            logger.info("dlp_violations_redacted", count=len(violations), rules=[v["rule"] for v in violations])

        return redacted, violations

    @staticmethod
    def has_sensitive_data(text: str) -> bool:
        if not text:
            return False
        for _, pattern, _ in DLP_RULES + SEMANTIC_PATTERNS:
            if pattern.search(text):
                return True
        return False


dlp_service = DataLossPreventionService()
