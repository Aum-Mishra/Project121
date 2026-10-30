import re
from typing import Tuple, List, Optional
from app.core.logging import get_logger

logger = get_logger(__name__)

# Heuristic patterns for direct prompt injection, jailbreaks, and delimiter escapes
PROMPT_INJECTION_PATTERNS: List[Tuple[str, re.Pattern]] = [
    (
        "instruction_override",
        re.compile(r"\b(ignore|disregard|forget|overwrite|bypass|cancel)\s+(all\s+)?(previous|prior|above|system)\s+(instructions|directives|prompts|rules|constraints)\b", re.IGNORECASE)
    ),
    (
        "system_override",
        re.compile(r"\b(system\s+override|developer\s+mode|root\s+access|maintenance\s+mode|administrative\s+override)\b", re.IGNORECASE)
    ),
    (
        "jailbreak_persona",
        re.compile(r"\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(dan|uncensored|anarchist|evil|jailbroken|unrestricted|bypass\s+ai)\b", re.IGNORECASE)
    ),
    (
        "system_prompt_exfiltration",
        re.compile(r"\b(reveal|print|show|repeat|display|output)\s+(your\s+)?(system\s+prompt|initial\s+prompt|hidden\s+instructions|base\s+instructions|system\s+instructions)\b", re.IGNORECASE)
    ),
    (
        "delimiter_tampering",
        re.compile(r"(---+\s*(end|start)\s+(system(\s+prompt|\s+instructions?)?|instructions?|admin)\s*---+|```system|\[system\]|\[assistant\]|<system>)", re.IGNORECASE)
    ),
    (
        "do_anything_now",
        re.compile(r"\b(do\s+anything\s+now|ignore\s+all\s+guidelines|unfiltered\s+mode)\b", re.IGNORECASE)
    ),
]


class PromptDefenseShield:
    @staticmethod
    def inspect_query(query: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Inspects input query for adversarial prompt injection patterns.
        Returns (is_safe, attack_type, explanation).
        """
        if not query:
            return True, None, None

        q_clean = query.strip()
        for attack_name, pattern in PROMPT_INJECTION_PATTERNS:
            match = pattern.search(q_clean)
            if match:
                logger.warning(
                    "prompt_injection_detected",
                    attack_type=attack_name,
                    matched_snippet=match.group(0),
                )
                return (
                    False,
                    attack_name,
                    f"Adversarial prompt injection pattern detected ({attack_name}). Access blocked."
                )

        return True, None, None


prompt_defense = PromptDefenseShield()
