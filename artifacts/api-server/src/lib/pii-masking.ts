/**
 * PII (Personally Identifiable Information) Masking Utilities
 * 
 * Provides comprehensive masking and sanitization functions for dashboard display.
 * Masks sensitive data like account numbers, phone numbers, emails, addresses, etc.
 * 
 * This utility implements:
 * - Account number masking (show last 4 digits)
 * - Phone number masking
 * - Email masking
 * - Address component masking
 * - Full object deep masking
 * - Selective field masking based on rules
 */

// PII field types that should be masked
export enum PiiFieldType {
  ACCOUNT_NUMBER = "account_number",
  PHONE = "phone",
  EMAIL = "email",
  ADDRESS = "address",
  NAME = "name",
  IFSC = "ifsc",
  BRANCH_NAME = "branch_name",
  WALLET_ADDRESS = "wallet_address",
  IP_ADDRESS = "ip_address",
  TRANSACTION_ID = "transaction_id",
  REFERENCE_NUMBER = "reference_number",
  DOB = "dob",
  PANCARD = "pancard",
  AADHAAR = "aadhaar",
}

// Configuration for masking rules
export interface MaskingConfig {
  maskAccountNumbers: boolean;
  maskPhoneNumbers: boolean;
  maskEmails: boolean;
  maskAddresses: boolean;
  maskNames: boolean;
  maskIFSC: boolean;
  maskBranchNames: boolean;
  maskWalletAddresses: boolean;
  maskIPAddresses: boolean;
  maskTransactionIds: boolean;
  maskReferenceNumbers: boolean;
  maskDOB: boolean;
  maskPANCard: boolean;
  maskAadhaar: boolean;
  showLastNCharacters: number; // How many chars to show at end (default 4)
  maskingCharacter: string; // Character to use for masking (default X)
}

// Default masking configuration
export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  maskAccountNumbers: true,
  maskPhoneNumbers: true,
  maskEmails: true,
  maskAddresses: true,
  maskNames: true,
  maskIFSC: true,
  maskBranchNames: false, // Branch names are less sensitive
  maskWalletAddresses: true,
  maskIPAddresses: true,
  maskTransactionIds: false, // Transaction IDs are safe to show
  maskReferenceNumbers: false, // Reference numbers are safe to show
  maskDOB: true,
  maskPANCard: true,
  maskAadhaar: true,
  showLastNCharacters: 4,
  maskingCharacter: "X",
};

/**
 * Masks an account number showing only last N digits
 * Example: "12345678901234" -> "XXXXXXXXXX1234"
 */
export function maskAccountNumber(
  accountNumber: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!accountNumber || typeof accountNumber !== "string") {
    return "N/A";
  }

  const clean = accountNumber.trim();
  if (clean.length <= config.showLastNCharacters) {
    return clean; // Too short to mask meaningfully
  }

  const maskLength = clean.length - config.showLastNCharacters;
  const mask = config.maskingCharacter.repeat(maskLength);
  return mask + clean.slice(-config.showLastNCharacters);
}

/**
 * Masks a phone number
 * Example: "+91-9876543210" -> "+91-****543210"
 */
export function maskPhoneNumber(
  phoneNumber: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return "N/A";
  }

  const clean = phoneNumber.replace(/\D/g, "");
  if (clean.length < 6) {
    return phoneNumber; // Too short to mask
  }

  // Show last 4 digits, mask middle
  const lastFour = clean.slice(-4);
  const prefix = phoneNumber.substring(0, phoneNumber.indexOf(clean[0])); // Preserve +91-, etc
  const maskLength = Math.max(4, clean.length - 4);
  const mask = "*".repeat(maskLength);

  return prefix ? `${prefix}-${mask}${lastFour}` : `${mask}${lastFour}`;
}

/**
 * Masks an email address
 * Example: "john.doe@example.com" -> "j***.***@example.com"
 */
export function maskEmail(
  email: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return "N/A";
  }

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "N/A";
  }

  // Show first and last char of local part
  const first = localPart[0];
  const last = localPart[localPart.length - 1];
  const mask = "*".repeat(Math.max(3, localPart.length - 2));

  return `${first}${mask}${last}@${domain}`;
}

/**
 * Masks a complete address
 * Example: "123 Main St, Bengaluru, Karnataka 560034" -> "*** Main St, Bengaluru, *** 560034"
 */
export function maskAddress(
  address: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!address || typeof address !== "string") {
    return "N/A";
  }

  // Mask street number/house number but keep street name and city
  const parts = address.split(",").map((part) => {
    const trimmed = part.trim();
    // Try to mask numbers at the beginning
    if (/^\d+/.test(trimmed)) {
      return trimmed.replace(/^\d+/, "***");
    }
    return trimmed;
  });

  return parts.join(", ");
}

/**
 * Masks a person's name
 * Example: "John Doe" -> "J*** D***"
 */
export function maskName(
  name: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!name || typeof name !== "string") {
    return "N/A";
  }

  const parts = name.split(" ");
  return parts
    .map((part) => {
      if (part.length <= 1) return part;
      return part[0] + "*".repeat(Math.max(3, part.length - 1));
    })
    .join(" ");
}

/**
 * Masks a wallet address (crypto)
 * Example: "0x7A4C9D12...92F" or "0x7A4C9D12A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P92F"
 * Result: "0x7A4C...92F"
 */
export function maskWalletAddress(
  address: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!address || typeof address !== "string") {
    return "N/A";
  }

  const clean = address.trim();

  // Already abbreviated (has dots)
  if (clean.includes("...")) {
    return clean;
  }

  // For Ethereum addresses (0x + 40 hex chars)
  if (clean.startsWith("0x") && clean.length > 10) {
    const prefix = clean.substring(0, 6); // 0x + 4 chars
    const suffix = clean.slice(-4);
    return `${prefix}...${suffix}`;
  }

  // For other crypto addresses
  if (clean.length > 12) {
    const prefix = clean.substring(0, 6);
    const suffix = clean.slice(-4);
    return `${prefix}...${suffix}`;
  }

  return clean;
}

/**
 * Masks an IP address
 * Example: "192.168.1.100" -> "192.168.1.***"
 */
export function maskIPAddress(
  ipAddress: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!ipAddress || typeof ipAddress !== "string") {
    return "N/A";
  }

  const parts = ipAddress.split(".");
  if (parts.length === 4) {
    // IPv4
    parts[3] = "***";
    return parts.join(".");
  }

  // IPv6 or other format - mask last segment
  return ipAddress.replace(/:\w+$/, ":****");
}

/**
 * Masks a PAN Card number
 * Example: "AAAPK1234K" -> "AAAP****K"
 */
export function maskPANCard(
  pan: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!pan || typeof pan !== "string" || pan.length < 6) {
    return "N/A";
  }

  const first4 = pan.substring(0, 4);
  const last1 = pan.slice(-1);
  return `${first4}****${last1}`;
}

/**
 * Masks an Aadhaar number (Indian ID)
 * Example: "123456789012" -> "****9012"
 */
export function maskAadhaar(
  aadhaar: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!aadhaar || typeof aadhaar !== "string" || aadhaar.length < 4) {
    return "N/A";
  }

  const last4 = aadhaar.slice(-4);
  return `****${last4}`;
}

/**
 * Masks a date of birth
 * Shows only year or masks completely
 */
export function maskDOB(
  dob: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!dob || typeof dob !== "string") {
    return "N/A";
  }

  // If it's a full date, try to extract year
  if (dob.match(/\d{4}-\d{2}-\d{2}/)) {
    const year = dob.substring(0, 4);
    return `**-**-${year}`;
  }

  return "**-**-****";
}

/**
 * Masks IFSC code (Indian banking)
 * Example: "SNBK0000421" -> "SNBK***421"
 */
export function maskIFSC(
  ifsc: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!ifsc || typeof ifsc !== "string" || ifsc.length < 6) {
    return "N/A";
  }

  const first4 = ifsc.substring(0, 4);
  const last3 = ifsc.slice(-3);
  return `${first4}***${last3}`;
}

/**
 * Generic field masking based on field name and type detection
 */
export function maskField(
  value: any,
  fieldName: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const lowerFieldName = fieldName.toLowerCase();

  // Detect PII field type from name
  if (
    lowerFieldName.includes("account") &&
    lowerFieldName.includes("number") &&
    config.maskAccountNumbers
  ) {
    return maskAccountNumber(value, config);
  }

  if (
    lowerFieldName.includes("phone") ||
    lowerFieldName.includes("mobile") ||
    lowerFieldName.includes("contact")
  ) {
    if (config.maskPhoneNumbers) {
      return maskPhoneNumber(value, config);
    }
  }

  if ((lowerFieldName.includes("email") || lowerFieldName.includes("mail")) && config.maskEmails) {
    return maskEmail(value, config);
  }

  if (
    lowerFieldName.includes("address") ||
    lowerFieldName.includes("street") ||
    lowerFieldName.includes("location")
  ) {
    if (config.maskAddresses) {
      return maskAddress(value, config);
    }
  }

  if (
    (lowerFieldName.includes("name") || lowerFieldName.includes("owner")) &&
    config.maskNames &&
    !lowerFieldName.includes("bank") // "bank_name" shouldn't be masked
  ) {
    return maskName(value, config);
  }

  if (lowerFieldName.includes("ifsc") && config.maskIFSC) {
    return maskIFSC(value, config);
  }

  if (lowerFieldName.includes("branch") && config.maskBranchNames) {
    return maskBranchName(value, config);
  }

  if (
    (lowerFieldName.includes("wallet") || lowerFieldName.includes("address")) &&
    config.maskWalletAddresses &&
    (value.startsWith("0x") || value.length > 30)
  ) {
    return maskWalletAddress(value, config);
  }

  if (lowerFieldName.includes("ip") && config.maskIPAddresses) {
    return maskIPAddress(value, config);
  }

  if (lowerFieldName.includes("pan") && config.maskPANCard) {
    return maskPANCard(value, config);
  }

  if (lowerFieldName.includes("aadhaar") && config.maskAadhaar) {
    return maskAadhaar(value, config);
  }

  if ((lowerFieldName.includes("dob") || lowerFieldName.includes("birth")) && config.maskDOB) {
    return maskDOB(value, config);
  }

  return value;
}

/**
 * Masks a branch name (less aggressive than full address)
 */
export function maskBranchName(
  branchName: string,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!branchName || typeof branchName !== "string") {
    return "N/A";
  }

  // Extract city/location if present (keep it)
  // Mask specific branch identifiers
  const parts = branchName.split("·");
  if (parts.length > 1) {
    return parts.map((part, idx) => (idx === 0 ? part : part.trim())).join(" ·");
  }

  return branchName;
}

/**
 * Deep object masking - recursively masks PII fields in an object
 */
export function maskObject(
  obj: any,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG,
  depth: number = 0,
  maxDepth: number = 10
): any {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return obj;
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => maskObject(item, config, depth + 1, maxDepth));
  }

  // Handle primitives
  if (typeof obj !== "object") {
    return obj;
  }

  // Handle objects
  const masked: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      masked[key] = value;
    } else if (typeof value === "string") {
      masked[key] = maskField(value, key, config);
    } else if (typeof value === "object") {
      masked[key] = maskObject(value, config, depth + 1, maxDepth);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Creates a selective masking function for specific routes/dashboards
 * Allows fine-grained control over what gets masked
 */
export class PiiMasker {
  private config: MaskingConfig;
  private fieldsToMask: Set<string>;
  private fieldsToKeep: Set<string>;

  constructor(config: Partial<MaskingConfig> = {}) {
    this.config = { ...DEFAULT_MASKING_CONFIG, ...config };
    this.fieldsToMask = new Set();
    this.fieldsToKeep = new Set();
  }

  /**
   * Mark specific fields to always mask
   */
  maskField(fieldName: string): this {
    this.fieldsToMask.add(fieldName.toLowerCase());
    return this;
  }

  /**
   * Mark specific fields to never mask
   */
  keepField(fieldName: string): this {
    this.fieldsToKeep.add(fieldName.toLowerCase());
    return this;
  }

  /**
   * Apply masking to an object
   */
  apply(obj: any): any {
    if (!obj || typeof obj !== "object") {
      return obj;
    }

    return this.applyRecursive(obj);
  }

  private applyRecursive(obj: any, depth: number = 0): any {
    if (depth > 10) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.applyRecursive(item, depth + 1));
    }

    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check explicit keep rules first
      if (this.fieldsToKeep.has(lowerKey)) {
        result[key] = value;
        continue;
      }

      // Check explicit mask rules
      if (this.fieldsToMask.has(lowerKey)) {
        if (typeof value === "string") {
          result[key] = maskField(value, key, this.config);
        } else if (typeof value === "object") {
          result[key] = this.applyRecursive(value, depth + 1);
        } else {
          result[key] = value;
        }
        continue;
      }

      // Apply default field detection masking
      if (typeof value === "string") {
        result[key] = maskField(value, key, this.config);
      } else if (typeof value === "object") {
        result[key] = this.applyRecursive(value, depth + 1);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
