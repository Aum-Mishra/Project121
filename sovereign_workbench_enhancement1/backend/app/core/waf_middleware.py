import re
import time
from typing import Dict, List, Tuple
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from app.core.logging import get_logger

logger = get_logger(__name__)

# WAF Attack Signature Regexes
WAF_SIGNATURES: List[Tuple[str, re.Pattern]] = [
    (
        "SQL_INJECTION",
        re.compile(r"(?i)(\b(UNION\s+SELECT|SELECT\s+.*\s+FROM|INSERT\s+INTO|DELETE\s+FROM|DROP\s+(TABLE|DATABASE)|ALTER\s+TABLE)\b|'\s*OR\s*['\d\w]+\s*=\s*['\d\w]+|--\s*$|\bSLEEP\(\s*\d+\s*\))"),
    ),
    (
        "CROSS_SITE_SCRIPTING",
        re.compile(r"(?i)(<script[\s\S]*?>|javascript:\s*|onerror\s*=|onload\s*=|alert\(|<iframe[\s\S]*?>|<img\s+src=.*onerror=)"),
    ),
    (
        "PATH_TRAVERSAL",
        re.compile(r"(\.\./|\.\.\\|%2e%2e%2f|%2e%2e/|\.\.%2f|/etc/passwd|/etc/shadow|c:\\windows\\system32|win\.ini)"),
    ),
    (
        "OS_COMMAND_INJECTION",
        re.compile(r"(?i)(;\s*(rm|cat|ls|chmod|chown|wget|curl|nc|bash|sh|powershell|cmd)\s+|\|\s*(rm|cat|ls|wget|curl|bash)\s+|\b(eval|exec|system)\s*\(|`[^`]+`|\$\([^)]+\))"),
    ),
    (
        "SCANNER_PROBE",
        re.compile(r"(?i)\b(sqlmap|nikto|acunetix|havij|nessus|nmap|masscan|dirbuster|gobuster)\b"),
    ),
]


class RateLimiter:
    """In-memory sliding window rate limiter per client IP."""
    def __init__(self, max_requests: int = 150, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[float]] = {}

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        
        # Prune old entries
        times = [t for t in self.requests.get(client_ip, []) if t > window_start]
        if len(times) >= self.max_requests:
            self.requests[client_ip] = times
            return False
        times.append(now)
        self.requests[client_ip] = times
        return True


class WebApplicationFirewallMiddleware(BaseHTTPMiddleware):
    """
    On-premise Web Application Firewall (WAF) middleware for Sovereign AI Workbench.
    Enforces deep packet inspection, rate limiting, and signature filtering.
    """
    def __init__(self, app, enabled: bool = True, max_requests_per_min: int = 180):
        super().__init__(app)
        self.enabled = enabled
        self.rate_limiter = RateLimiter(max_requests=max_requests_per_min, window_seconds=60)
        self.waf_metrics = {
            "total_inspected": 0,
            "total_blocked": 0,
            "blocked_reasons": {},
        }

    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)

        self.waf_metrics["total_inspected"] += 1
        client_ip = request.client.host if request.client else "unknown"

        # 1. Rate Limiting Check
        if not self.rate_limiter.is_allowed(client_ip):
            self.waf_metrics["total_blocked"] += 1
            self.waf_metrics["blocked_reasons"]["RATE_LIMIT_EXCEEDED"] = self.waf_metrics["blocked_reasons"].get("RATE_LIMIT_EXCEEDED", 0) + 1
            logger.warn("waf_rate_limit_blocked", client_ip=client_ip, path=request.url.path)
            return JSONResponse(
                status_code=429,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "detail": "Request threshold exceeded. Sovereign rate limiter active.",
                }
            )

        # 2. Inspect Path and Query String
        url_target = f"{request.url.path}?{request.url.query}" if request.url.query else request.url.path
        for attack_name, pattern in WAF_SIGNATURES:
            if pattern.search(url_target):
                return self._block_request(attack_name, f"Query/Path attack signature: {attack_name}", client_ip, request.url.path)

        # 3. Inspect Headers (User-Agent, Referer, Host)
        user_agent = request.headers.get("user-agent", "")
        for attack_name, pattern in WAF_SIGNATURES:
            if pattern.search(user_agent):
                return self._block_request(attack_name, f"Malicious User-Agent probe: {attack_name}", client_ip, request.url.path)

        # Pass through to next handler
        response = await call_next(request)
        return response

    def _block_request(self, attack_type: str, reason: str, client_ip: str, path: str) -> JSONResponse:
        self.waf_metrics["total_blocked"] += 1
        self.waf_metrics["blocked_reasons"][attack_type] = self.waf_metrics["blocked_reasons"].get(attack_type, 0) + 1
        logger.error(
            "waf_attack_intercepted",
            attack_type=attack_type,
            reason=reason,
            client_ip=client_ip,
            path=path,
        )
        return JSONResponse(
            status_code=403,
            content={
                "error": "WAF_ATTACK_INTERCEPTED",
                "attack_type": attack_type,
                "detail": f"Request rejected by Sovereign Web Application Firewall. {reason}",
            }
        )

