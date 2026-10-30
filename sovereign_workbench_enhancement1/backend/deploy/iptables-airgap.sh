#!/usr/bin/env bash
# ==============================================================================
# Sovereign On-Premise AI Workbench: Air-Gap Kernel iptables Firewall Rules
# Enforces Zero External Internet Egress & Microservice Subnet Isolation
# ==============================================================================

set -euo pipefail

echo "[*] Initializing Sovereign Air-Gap Kernel Firewall (iptables)..."

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# Set Default Policies: Strict DROP on Forward and Outbound WAN
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# 1. Allow Loopback Traffic (127.0.0.1)
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# 2. Allow Established and Related Sessions
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 3. Allow Internal Sovereign Docker Bridge Subnet (172.28.0.0/16)
iptables -A INPUT -s 172.28.0.0/16 -d 172.28.0.0/16 -j ACCEPT
iptables -A OUTPUT -s 172.28.0.0/16 -d 172.28.0.0/16 -j ACCEPT
iptables -A FORWARD -s 172.28.0.0/16 -d 172.28.0.0/16 -j ACCEPT

# 4. Allow Local Intranet Workstation Ingress on Ports 8000 & 8443
iptables -A INPUT -p tcp --dport 8000 -m state --state NEW -j ACCEPT
iptables -A INPUT -p tcp --dport 8443 -m state --state NEW -j ACCEPT

# 5. Restrict DNS Queries strictly to Local Sovereign CoreDNS (127.0.0.1:53)
iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT

# 6. Explicitly DROP and Log Any Outbound WAN Egress Attempts (Airgap Boundary)
iptables -A OUTPUT -d 0.0.0.0/0 -p tcp --dport 443 -j LOG --log-prefix "[SOVEREIGN AIRGAP DROP 443]: "
iptables -A OUTPUT -d 0.0.0.0/0 -p tcp --dport 80 -j LOG --log-prefix "[SOVEREIGN AIRGAP DROP 80]: "
iptables -A OUTPUT -d 0.0.0.0/0 -j DROP

# 7. Sandbox Non-Root User Isolation (UID 10001 Dropped from All Non-Local Networks)
iptables -A OUTPUT -m owner --uid-owner 10001 ! -d 127.0.0.1 -j DROP

echo "[OK] Sovereign Air-Gap Kernel Firewall active: All cloud egress DROP enforced."

