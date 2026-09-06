"""Production configuration for CASHNET with real-time data ingestion.

This configuration enables production-ready features:
- PostgreSQL database persistence
- Real-time data ingestion from NCRP, SAHYOG, VASP
- Redis caching for performance
- Event streaming for scalability
- Real-time ML predictions
"""

import os
from datetime import UTC, datetime, timedelta

# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://cashnet:password@localhost:5432/cashnet"
)

DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "5"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "20"))
DB_STATEMENT_TIMEOUT = int(os.getenv("DB_STATEMENT_TIMEOUT", "30000"))  # 30 seconds

# ============================================================================
# REDIS CONFIGURATION (Optional - for caching)
# ============================================================================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_CACHE_TTL = int(os.getenv("REDIS_CACHE_TTL", "3600"))  # 1 hour
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() == "true"

# ============================================================================
# EXTERNAL INTEGRATION CREDENTIALS
# ============================================================================

# NCRP (National Crime Records Portal) - India
NCRP_CONFIG = {
    "api_url": os.getenv("NCRP_API_URL", "https://ncrp.gov.in/api"),
    "api_key": os.getenv("NCRP_API_KEY", ""),
    "sync_interval": int(os.getenv("NCRP_SYNC_INTERVAL", "300")),  # 5 minutes
    "timeout": 30,
    "enabled": os.getenv("NCRP_ENABLED", "true").lower() == "true",
}

# SAHYOG - Inter-agency cooperation platform
SAHYOG_CONFIG = {
    "api_url": os.getenv("SAHYOG_API_URL", "https://sahyog.gov.in/api"),
    "api_key": os.getenv("SAHYOG_API_KEY", ""),
    "sync_interval": int(os.getenv("SAHYOG_SYNC_INTERVAL", "300")),
    "timeout": 30,
    "enabled": os.getenv("SAHYOG_ENABLED", "true").lower() == "true",
}

# VASP (Virtual Asset Service Provider)
VASP_CONFIG = {
    "webhook_url": os.getenv("VASP_WEBHOOK_URL", "https://your-domain.com/webhooks/vasp"),
    "webhook_secret": os.getenv("VASP_WEBHOOK_SECRET", ""),
    "enabled": os.getenv("VASP_ENABLED", "true").lower() == "true",
}

# ============================================================================
# BLOCKCHAIN INTEGRATION
# ============================================================================

BLOCKCHAIN_CONFIG = {
    "provider_url": os.getenv("BLOCKCHAIN_PROVIDER", "https://eth.llamarpc.com"),
    "watch_addresses": os.getenv("BLOCKCHAIN_WATCH_ADDRESSES", "").split(","),
    "check_interval": int(os.getenv("BLOCKCHAIN_CHECK_INTERVAL", "60")),  # 1 minute
    "enabled": os.getenv("BLOCKCHAIN_ENABLED", "true").lower() == "true",
}

# ============================================================================
# EVENT STREAMING (Optional - for scale)
# ============================================================================

KAFKA_CONFIG = {
    "bootstrap_servers": os.getenv("KAFKA_BROKERS", "kafka:9092").split(","),
    "consumer_group": "cashnet-ml-pipeline",
    "topics": {
        "transactions": "cashnet-transactions",
        "alerts": "cashnet-alerts",
        "events": "cashnet-events",
    },
    "enabled": os.getenv("KAFKA_ENABLED", "false").lower() == "true",
}

# ============================================================================
# ML MODEL CONFIGURATION
# ============================================================================

ML_CONFIG = {
    "model_path": os.getenv("ML_MODEL_PATH", "/models/production.pkl"),
    "model_version": os.getenv("ML_MODEL_VERSION", "1.0"),
    "update_interval": int(os.getenv("ML_UPDATE_INTERVAL", "3600")),  # 1 hour
    "retrain_threshold": float(os.getenv("ML_RETRAIN_THRESHOLD", "0.05")),  # 5% performance drop
    "prediction_timeout": int(os.getenv("ML_PREDICTION_TIMEOUT", "5000")),  # 5 seconds
}

# ============================================================================
# REAL-TIME SETTINGS
# ============================================================================

REAL_TIME_CONFIG = {
    # Transaction processing
    "transaction_batch_size": int(os.getenv("TX_BATCH_SIZE", "100")),
    "transaction_flush_interval": int(os.getenv("TX_FLUSH_INTERVAL", "10")),  # 10 seconds
    
    # Alert thresholds
    "alert_risk_threshold": float(os.getenv("ALERT_RISK_THRESHOLD", "0.7")),
    "alert_velocity_threshold": int(os.getenv("ALERT_VELOCITY_THRESHOLD", "10")),  # 10 txns/hour
    
    # Feature extraction
    "velocity_window_hours": int(os.getenv("VELOCITY_WINDOW", "24")),
    "distance_threshold": float(os.getenv("DISTANCE_THRESHOLD", "1000")),  # km
    
    # Data freshness monitoring
    "max_freshness_lag_minutes": int(os.getenv("MAX_FRESHNESS_LAG", "15")),
    "freshness_check_interval": int(os.getenv("FRESHNESS_CHECK_INTERVAL", "60")),
}

# ============================================================================
# OBSERVABILITY & MONITORING
# ============================================================================

MONITORING_CONFIG = {
    "prometheus_enabled": os.getenv("PROMETHEUS_ENABLED", "true").lower() == "true",
    "prometheus_port": int(os.getenv("PROMETHEUS_PORT", "8000")),
    
    "logging_level": os.getenv("LOG_LEVEL", "INFO"),
    "log_format": os.getenv("LOG_FORMAT", "json"),
    
    "traces_enabled": os.getenv("TRACES_ENABLED", "false").lower() == "true",
    "traces_sample_rate": float(os.getenv("TRACES_SAMPLE_RATE", "0.1")),
}

# ============================================================================
# API CONFIGURATION
# ============================================================================

API_CONFIG = {
    "host": os.getenv("API_HOST", "0.0.0.0"),
    "port": int(os.getenv("API_PORT", "8080")),
    "workers": int(os.getenv("API_WORKERS", "4")),
    "timeout": int(os.getenv("API_TIMEOUT", "60")),
    
    # Rate limiting
    "rate_limit_enabled": os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true",
    "rate_limit_requests": int(os.getenv("RATE_LIMIT_REQUESTS", "1000")),
    "rate_limit_period": int(os.getenv("RATE_LIMIT_PERIOD", "3600")),  # 1 hour
}

# ============================================================================
# DATA MIGRATION SETTINGS
# ============================================================================

MIGRATION_CONFIG = {
    # Batch migration settings
    "batch_size": int(os.getenv("MIGRATION_BATCH_SIZE", "1000")),
    "parallel_workers": int(os.getenv("MIGRATION_WORKERS", "4")),
    
    # Fallback to synthetic data if integrations unavailable
    "fallback_to_synthetic": os.getenv("FALLBACK_TO_SYNTHETIC", "true").lower() == "true",
}

# ============================================================================
# DATA RETENTION
# ============================================================================

DATA_RETENTION_CONFIG = {
    "transaction_retention_days": int(os.getenv("TX_RETENTION_DAYS", "365")),
    "alert_retention_days": int(os.getenv("ALERT_RETENTION_DAYS", "730")),
    "audit_trail_retention_days": int(os.getenv("AUDIT_RETENTION_DAYS", "2555")),  # 7 years for compliance
}

# ============================================================================
# SECURITY
# ============================================================================

SECURITY_CONFIG = {
    "api_key_enabled": os.getenv("API_KEY_ENABLED", "true").lower() == "true",
    "jwt_secret": os.getenv("JWT_SECRET", "change-me-in-production"),
    "jwt_algorithm": "HS256",
    "jwt_expiry_hours": int(os.getenv("JWT_EXPIRY", "24")),
    
    # CORS
    "cors_enabled": os.getenv("CORS_ENABLED", "true").lower() == "true",
    "cors_origins": os.getenv("CORS_ORIGINS", "https://localhost:3000").split(","),
    
    # SSL/TLS
    "ssl_enabled": os.getenv("SSL_ENABLED", "false").lower() == "true",
    "ssl_cert_path": os.getenv("SSL_CERT_PATH", ""),
    "ssl_key_path": os.getenv("SSL_KEY_PATH", ""),
}

# ============================================================================
# FEATURE FLAGS
# ============================================================================

FEATURES = {
    # Data sources
    "use_ncrp_data": os.getenv("USE_NCRP_DATA", "true").lower() == "true",
    "use_sahyog_data": os.getenv("USE_SAHYOG_DATA", "true").lower() == "true",
    "use_vasp_data": os.getenv("USE_VASP_DATA", "true").lower() == "true",
    "use_blockchain_data": os.getenv("USE_BLOCKCHAIN_DATA", "true").lower() == "true",
    
    # ML features
    "use_real_time_ml": os.getenv("USE_REAL_TIME_ML", "true").lower() == "true",
    "use_ensemble_models": os.getenv("USE_ENSEMBLE_MODELS", "false").lower() == "true",
    
    # Async processing
    "use_event_streaming": os.getenv("USE_EVENT_STREAMING", "false").lower() == "true",
    "use_batch_processing": os.getenv("USE_BATCH_PROCESSING", "true").lower() == "true",
    
    # Caching
    "use_redis_cache": os.getenv("USE_REDIS_CACHE", "true").lower() == "true",
    
    # Notifications
    "enable_real_time_alerts": os.getenv("ENABLE_REAL_TIME_ALERTS", "true").lower() == "true",
}

# ============================================================================
# HEALTH CHECK CONFIGURATION
# ============================================================================

HEALTH_CHECK_CONFIG = {
    "database": {
        "enabled": True,
        "timeout": 5,
    },
    "redis": {
        "enabled": REDIS_ENABLED,
        "timeout": 5,
    },
    "kafka": {
        "enabled": KAFKA_CONFIG["enabled"],
        "timeout": 5,
    },
    "integrations": {
        "ncrp": NCRP_CONFIG["enabled"],
        "sahyog": SAHYOG_CONFIG["enabled"],
        "vasp": VASP_CONFIG["enabled"],
    },
}

# ============================================================================
# ENVIRONMENT-SPECIFIC OVERRIDES
# ============================================================================

ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

if ENVIRONMENT == "development":
    # Dev mode: relaxed timeouts, verbose logging, synthetic data fallback
    REAL_TIME_CONFIG["transaction_batch_size"] = 10
    MONITORING_CONFIG["logging_level"] = "DEBUG"
    MIGRATION_CONFIG["fallback_to_synthetic"] = True

elif ENVIRONMENT == "staging":
    # Staging: production-like but with monitoring
    MONITORING_CONFIG["traces_sample_rate"] = 0.5

elif ENVIRONMENT == "production":
    # Production: strict settings, aggressive caching
    REAL_TIME_CONFIG["alert_risk_threshold"] = 0.8
    SECURITY_CONFIG["jwt_secret"] = os.getenv("JWT_SECRET")  # Must be set!
