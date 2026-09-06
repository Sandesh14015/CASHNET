"""Rules-based Typology Detection Service.

Detects known fraud patterns (typologies) using configurable rules,
transaction analysis, and behavioral signals.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TypologyCategory(StrEnum):
    """Fraud typology categories."""

    RANSOMWARE = "ransomware"
    PHISHING = "phishing"
    INVESTMENT_SCAM = "investment_scam"
    ROMANCE_SCAM = "romance_scam"
    MONEY_LAUNDERING = "money_laundering"
    TERRORISM_FINANCING = "terrorism_financing"
    SANCTIONS_EVASION = "sanctions_evasion"
    MIXER_TUMBLER = "mixer_tumbler"
    DARKNET_MARKET = "darknet_market"
    SCAM_TOKEN = "scam_token"
    DECENTRALIZED_FINANCE_ABUSE = "defi_abuse"
    NFT_FRAUD = "nft_fraud"
    PIG_BUTCHERING = "pig_butchering"
    OTHER = "other"


class MatchSeverity(StrEnum):
    """Match severity levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RuleConditionType(StrEnum):
    """Types of rule conditions."""

    VALUE_THRESHOLD = "value_threshold"
    VALUE_RANGE = "value_range"
    CURRENCY_MATCH = "currency_match"
    CHAIN_MATCH = "chain_match"
    ADDRESS_LIST = "address_list"
    PATTERN_MATCH = "pattern_match"
    FREQUENCY = "frequency"
    TIME_WINDOW = "time_window"
    COUNTERPARTY_TYPE = "counterparty_type"
    RISK_SCORE = "risk_score"
    LABEL_MATCH = "label_match"
    CLUSTER_PROXIMITY = "cluster_proximity"
    VELOCITY = "velocity"


class RuleCondition(BaseModel):
    """A single condition in a typology rule."""

    condition_type: RuleConditionType
    field: str  # Which transaction field to check
    operator: str  # "eq", "neq", "gt", "lt", "gte", "lte", "in", "not_in", "contains", "regex"
    value: Any  # Expected value or threshold
    description: str | None = None


class TypologyRule(BaseModel):
    """A typology detection rule."""

    rule_id: str
    name: str
    description: str
    category: TypologyCategory
    severity: MatchSeverity

    # Rule conditions (all must match for a hit)
    conditions: list[RuleCondition]

    # Scoring
    base_score: float = 0.5  # Base confidence if rule matches
    score_multiplier: float = 1.0  # Multiplier for additional conditions

    # Metadata
    version: int = 1
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: str = "manual"  # "manual", "ml_generated", "community"
    tags: list[str] = []

    # Thresholds
    min_match_count: int = 1  # Minimum conditions that must match
    confidence_boost: float = 0.0  # Additional confidence when all match


class TypologyMatch(BaseModel):
    """A detected typology match."""

    match_id: str
    rule_id: str
    rule_name: str
    category: TypologyCategory
    severity: MatchSeverity

    # Match details
    confidence: float
    matched_conditions: list[str]  # List of matched condition descriptions
    evidence: list[dict[str, Any]]  # Supporting evidence

    # Context
    transaction_hash: str | None = None
    address: str | None = None
    chain: str | None = None
    case_id: str | None = None

    # Metadata
    detected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    model_version: str | None = None
    metadata: dict[str, Any] = {}


class TypologyEngine:
    """Main typology detection engine."""

    def __init__(self):
        self._rules: dict[str, TypologyRule] = {}
        self._matches: list[TypologyMatch] = []
        self._rule_index: dict[TypologyCategory, list[str]] = {}  # category -> rule_ids

        # Load default rules
        self._load_default_rules()

    def _load_default_rules(self) -> None:
        """Load built-in typology rules."""
        default_rules = [
            TypologyRule(
                rule_id="mixer_interaction",
                name="Known Mixer Interaction",
                description="Transaction involves a known mixer or tumbler address",
                category=TypologyCategory.MIXER_TUMBLER,
                severity=MatchSeverity.HIGH,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.ADDRESS_LIST,
                        field="counterparty_address",
                        operator="in",
                        value="known_mixers",
                        description="Counterparty is a known mixer address",
                    ),
                ],
                base_score=0.85,
                tags=["mixer", "tumbler", "privacy"],
            ),
            TypologyRule(
                rule_id="high_value_rapid_movement",
                name="High Value Rapid Movement",
                description="Large value transaction followed by rapid subsequent transfers",
                category=TypologyCategory.MONEY_LAUNDERING,
                severity=MatchSeverity.HIGH,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.VALUE_THRESHOLD,
                        field="value_usd",
                        operator="gt",
                        value=100000,
                        description="Transaction value > $100,000",
                    ),
                    RuleCondition(
                        condition_type=RuleConditionType.TIME_WINDOW,
                        field="follow_up_transfers",
                        operator="lt",
                        value=3600,  # 1 hour
                        description="Follow-up transfers within 1 hour",
                    ),
                ],
                base_score=0.75,
                min_match_count=2,
                tags=["layering", "rapid_movement", "high_value"],
            ),
            TypologyRule(
                rule_id="structuring",
                name="Structuring / Smurfing",
                description="Multiple transactions just below reporting threshold",
                category=TypologyCategory.MONEY_LAUNDERING,
                severity=MatchSeverity.MEDIUM,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.VALUE_RANGE,
                        field="value_usd",
                        operator="between",
                        value=[9000, 10000],  # Just below $10K threshold
                        description="Transaction value between $9,000 and $10,000",
                    ),
                    RuleCondition(
                        condition_type=RuleConditionType.FREQUENCY,
                        field="transaction_count",
                        operator="gte",
                        value=3,
                        description="3+ similar transactions from same source",
                    ),
                ],
                base_score=0.7,
                min_match_count=2,
                tags=["structuring", "smurfing", "threshold"],
            ),
            TypologyRule(
                rule_id="scam_token_pattern",
                name="Scam Token Pattern",
                description="Token with characteristics of a scam/honeypot",
                category=TypologyCategory.SCAM_TOKEN,
                severity=MatchSeverity.HIGH,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.LABEL_MATCH,
                        field="token_labels",
                        operator="contains",
                        value=["honeypot", "scam", "fake"],
                        description="Token labeled as scam/honeypot",
                    ),
                ],
                base_score=0.9,
                tags=["scam", "honeypot", "token"],
            ),
            TypologyRule(
                rule_id="darknet_market",
                name="Darknet Market Interaction",
                description="Address associated with known darknet market",
                category=TypologyCategory.DARKNET_MARKET,
                severity=MatchSeverity.CRITICAL,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.ADDRESS_LIST,
                        field="address",
                        operator="in",
                        value="darknet_addresses",
                        description="Address is a known darknet market address",
                    ),
                ],
                base_score=0.95,
                tags=["darknet", "illicit", "marketplace"],
            ),
            TypologyRule(
                rule_id="investment_scam_velocity",
                name="Investment Scam Velocity",
                description="Rapid incoming funds from multiple sources (potential rug pull)",
                category=TypologyCategory.INVESTMENT_SCAM,
                severity=MatchSeverity.HIGH,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.VELOCITY,
                        field="unique_senders_24h",
                        operator="gte",
                        value=10,
                        description="10+ unique senders in 24 hours",
                    ),
                    RuleCondition(
                        condition_type=RuleConditionType.TIME_WINDOW,
                        field="first_to_last_transfer",
                        operator="lt",
                        value=86400,  # 24 hours
                        description="All transfers within 24 hour window",
                    ),
                ],
                base_score=0.7,
                min_match_count=2,
                tags=["rug_pull", "investment", "velocity"],
            ),
            TypologyRule(
                rule_id="sanctions_evasion",
                name="Sanctions Evasion Pattern",
                description="Transaction patterns consistent with sanctions evasion",
                category=TypologyCategory.SANCTIONS_EVASION,
                severity=MatchSeverity.CRITICAL,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.ADDRESS_LIST,
                        field="address",
                        operator="in",
                        value="sanctioned_addresses",
                        description="Address is sanctioned",
                    ),
                ],
                base_score=0.99,
                tags=["sanctions", "OFAC", "compliance"],
            ),
            TypologyRule(
                rule_id="bridge_laundering",
                name="Cross-Chain Laundering via Bridge",
                description="Funds moved through bridge to obscure origin",
                category=TypologyCategory.MONEY_LAUNDERING,
                severity=MatchSeverity.MEDIUM,
                conditions=[
                    RuleCondition(
                        condition_type=RuleConditionType.PATTERN_MATCH,
                        field="transaction_type",
                        operator="eq",
                        value="bridge",
                        description="Bridge transaction detected",
                    ),
                    RuleCondition(
                        condition_type=RuleConditionType.RISK_SCORE,
                        field="source_risk_score",
                        operator="gt",
                        value=0.6,
                        description="Source address has elevated risk score",
                    ),
                ],
                base_score=0.65,
                min_match_count=2,
                tags=["bridge", "cross_chain", "layering"],
            ),
        ]

        for rule in default_rules:
            self._rules[rule.rule_id] = rule
            if rule.category not in self._rule_index:
                self._rule_index[rule.category] = []
            self._rule_index[rule.category].append(rule.rule_id)

    def add_rule(self, rule: TypologyRule) -> TypologyRule:
        """Add or update a typology rule."""
        self._rules[rule.rule_id] = rule

        if rule.category not in self._rule_index:
            self._rule_index[rule.category] = []
        if rule.rule_id not in self._rule_index[rule.category]:
            self._rule_index[rule.category].append(rule.rule_id)

        return rule

    def get_rule(self, rule_id: str) -> TypologyRule | None:
        """Get a rule by ID."""
        return self._rules.get(rule_id)

    def remove_rule(self, rule_id: str) -> bool:
        """Remove a rule."""
        rule = self._rules.pop(rule_id, None)
        if rule:
            if rule.category in self._rule_index:
                self._rule_index[rule.category] = [
                    r for r in self._rule_index[rule.category] if r != rule_id
                ]
            return True
        return False

    def get_rules_by_category(self, category: TypologyCategory) -> list[TypologyRule]:
        """Get all rules for a category."""
        rule_ids = self._rule_index.get(category, [])
        return [self._rules[rid] for rid in rule_ids if rid in self._rules]

    def get_all_active_rules(self) -> list[TypologyRule]:
        """Get all active rules."""
        return [r for r in self._rules.values() if r.is_active]

    def evaluate_transaction(
        self,
        transaction: dict[str, Any],
        known_addresses: dict[str, set[str]] | None = None,
        context: dict[str, Any] | None = None,
    ) -> list[TypologyMatch]:
        """Evaluate a transaction against all active rules."""
        matches: list[TypologyMatch] = []
        context = context or {}

        for rule in self.get_all_active_rules():
            match = self._evaluate_rule(rule, transaction, known_addresses, context)
            if match:
                matches.append(match)
                self._matches.append(match)

        return matches

    def evaluate_address(
        self,
        address: str,
        chain: str,
        address_data: dict[str, Any] | None = None,
        known_addresses: dict[str, set[str]] | None = None,
    ) -> list[TypologyMatch]:
        """Evaluate an address against all active rules."""
        matches: list[TypologyMatch] = []
        address_data = address_data or {}

        for rule in self.get_all_active_rules():
            match = self._evaluate_address_rule(
                rule, address, chain, address_data, known_addresses
            )
            if match:
                matches.append(match)
                self._matches.append(match)

        return matches

    def get_matches(
        self,
        category: TypologyCategory | None = None,
        severity: MatchSeverity | None = None,
        case_id: str | None = None,
        limit: int = 100,
    ) -> list[TypologyMatch]:
        """Get detection matches with optional filters."""
        results = self._matches

        if category:
            results = [m for m in results if m.category == category]
        if severity:
            results = [m for m in results if m.severity == severity]
        if case_id:
            results = [m for m in results if m.case_id == case_id]

        return results[:limit]

    def get_statistics(self) -> dict[str, Any]:
        """Get typology detection statistics."""
        rules = list(self._rules.values())
        matches = self._matches

        # Count rules by category
        rules_by_category = {}
        for rule in rules:
            cat = rule.category.value
            rules_by_category[cat] = rules_by_category.get(cat, 0) + 1

        # Count matches by category
        matches_by_category = {}
        for match in matches:
            cat = match.category.value
            matches_by_category[cat] = matches_by_category.get(cat, 0) + 1

        # Count matches by severity
        matches_by_severity = {}
        for match in matches:
            sev = match.severity.value
            matches_by_severity[sev] = matches_by_severity.get(sev, 0) + 1

        # Average confidence
        avg_confidence = (
            sum(m.confidence for m in matches) / len(matches) if matches else 0.0
        )

        return {
            "total_rules": len(rules),
            "active_rules": sum(1 for r in rules if r.is_active),
            "total_matches": len(matches),
            "rules_by_category": rules_by_category,
            "matches_by_category": matches_by_category,
            "matches_by_severity": matches_by_severity,
            "average_confidence": round(avg_confidence, 4),
        }

    def _evaluate_rule(
        self,
        rule: TypologyRule,
        transaction: dict[str, Any],
        known_addresses: dict[str, set[str]] | None,
        context: dict[str, Any],
    ) -> TypologyMatch | None:
        """Evaluate a single rule against a transaction."""
        matched_conditions: list[str] = []
        evidence: list[dict[str, Any]] = []

        for condition in rule.conditions:
            if self._evaluate_condition(
                condition, transaction, known_addresses, context
            ):
                matched_conditions.append(
                    condition.description
                    or f"{condition.field} {condition.operator} {condition.value}"
                )
                evidence.append(
                    {
                        "condition_type": condition.condition_type.value,
                        "field": condition.field,
                        "operator": condition.operator,
                        "value": condition.value,
                        "actual_value": transaction.get(condition.field),
                    }
                )

        # Check if enough conditions matched
        if len(matched_conditions) >= rule.min_match_count:
            # Calculate confidence
            match_ratio = len(matched_conditions) / len(rule.conditions)
            confidence = min(
                rule.base_score * rule.score_multiplier * match_ratio
                + rule.confidence_boost,
                1.0,
            )

            import uuid

            return TypologyMatch(
                match_id=str(uuid.uuid4()),
                rule_id=rule.rule_id,
                rule_name=rule.name,
                category=rule.category,
                severity=rule.severity,
                confidence=confidence,
                matched_conditions=matched_conditions,
                evidence=evidence,
                transaction_hash=transaction.get("tx_hash"),
                address=transaction.get("from_address") or transaction.get("address"),
                chain=transaction.get("chain"),
                case_id=context.get("case_id"),
            )

        return None

    def _evaluate_address_rule(
        self,
        rule: TypologyRule,
        address: str,
        chain: str,
        address_data: dict[str, Any],
        known_addresses: dict[str, set[str]] | None,
    ) -> TypologyMatch | None:
        """Evaluate a single rule against an address."""
        matched_conditions: list[str] = []
        evidence: list[dict[str, Any]] = []

        for condition in rule.conditions:
            if self._evaluate_condition(
                condition,
                {
                    "address": address,
                    "chain": chain,
                    **address_data,
                },
                known_addresses,
                {},
            ):
                matched_conditions.append(
                    condition.description or f"{condition.field} {condition.operator}"
                )
                evidence.append(
                    {
                        "condition_type": condition.condition_type.value,
                        "field": condition.field,
                        "address": address,
                        "chain": chain,
                    }
                )

        if len(matched_conditions) >= rule.min_match_count:
            match_ratio = len(matched_conditions) / len(rule.conditions)
            confidence = min(
                rule.base_score * rule.score_multiplier * match_ratio
                + rule.confidence_boost,
                1.0,
            )

            import uuid

            return TypologyMatch(
                match_id=str(uuid.uuid4()),
                rule_id=rule.rule_id,
                rule_name=rule.name,
                category=rule.category,
                severity=rule.severity,
                confidence=confidence,
                matched_conditions=matched_conditions,
                evidence=evidence,
                address=address,
                chain=chain,
            )

        return None

    def _evaluate_condition(
        self,
        condition: RuleCondition,
        data: dict[str, Any],
        known_addresses: dict[str, set[str]] | None,
        context: dict[str, Any],
    ) -> bool:
        """Evaluate a single condition."""
        actual_value = data.get(condition.field)

        if actual_value is None:
            return False

        try:
            if condition.condition_type == RuleConditionType.VALUE_THRESHOLD:
                if condition.operator == "gt":
                    return float(actual_value) > float(condition.value)
                elif condition.operator == "lt":
                    return float(actual_value) < float(condition.value)
                elif condition.operator == "gte":
                    return float(actual_value) >= float(condition.value)
                elif condition.operator == "lte":
                    return float(actual_value) <= float(condition.value)
                elif condition.operator == "eq":
                    return float(actual_value) == float(condition.value)

            elif condition.condition_type == RuleConditionType.VALUE_RANGE:
                min_val, max_val = condition.value
                return float(min_val) <= float(actual_value) <= float(max_val)

            elif condition.condition_type == RuleConditionType.CURRENCY_MATCH:
                if condition.operator == "eq":
                    return actual_value == condition.value
                elif condition.operator == "in":
                    return actual_value in condition.value

            elif condition.condition_type == RuleConditionType.CHAIN_MATCH:
                return actual_value == condition.value

            elif condition.condition_type == RuleConditionType.ADDRESS_LIST:
                if known_addresses and condition.value in known_addresses:
                    return actual_value.lower() in {
                        a.lower() for a in known_addresses[condition.value]
                    }
                return False

            elif condition.condition_type == RuleConditionType.PATTERN_MATCH:
                if condition.operator == "eq":
                    return actual_value == condition.value
                elif condition.operator == "contains":
                    return condition.value in str(actual_value)
                elif condition.operator == "regex":
                    import re

                    return bool(re.search(condition.value, str(actual_value)))

            elif condition.condition_type == RuleConditionType.FREQUENCY:
                if condition.operator == "gte":
                    return int(actual_value) >= int(condition.value)
                elif condition.operator == "lte":
                    return int(actual_value) <= int(condition.value)

            elif condition.condition_type == RuleConditionType.TIME_WINDOW:
                if condition.operator == "lt":
                    return float(actual_value) < float(condition.value)
                elif condition.operator == "gt":
                    return float(actual_value) > float(condition.value)

            elif condition.condition_type == RuleConditionType.COUNTERPARTY_TYPE:
                return actual_value == condition.value

            elif condition.condition_type == RuleConditionType.RISK_SCORE:
                if condition.operator == "gt":
                    return float(actual_value) > float(condition.value)
                elif condition.operator == "lt":
                    return float(actual_value) < float(condition.value)

            elif condition.condition_type == RuleConditionType.LABEL_MATCH:
                if condition.operator == "contains":
                    labels = (
                        actual_value
                        if isinstance(actual_value, list)
                        else [actual_value]
                    )
                    target = (
                        condition.value
                        if isinstance(condition.value, list)
                        else [condition.value]
                    )
                    return any(label in labels for label in target)

            elif condition.condition_type == RuleConditionType.VELOCITY:
                if condition.operator == "gte":
                    return int(actual_value) >= int(condition.value)

        except (ValueError, TypeError):
            return False

        return False


def format_typology_match(match: TypologyMatch) -> str:
    """Format a typology match for display."""
    lines = [
        f"Typology Match: {match.rule_name}",
        f"Category: {match.category.value}",
        f"Severity: {match.severity.value}",
        f"Confidence: {match.confidence:.1%}",
        "",
        "Matched Conditions:",
    ]

    for condition in match.matched_conditions:
        lines.append(f"  - {condition}")

    if match.address:
        lines.append(f"\nAddress: {match.address}")
    if match.chain:
        lines.append(f"Chain: {match.chain}")
    if match.transaction_hash:
        lines.append(f"Transaction: {match.transaction_hash}")
    if match.case_id:
        lines.append(f"Case: {match.case_id}")

    return "\n".join(lines)
