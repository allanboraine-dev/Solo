export interface SaBank {
  id: string;
  name: string;
  universalBranchCode: string;
  accountNumberLengths: number[];
}

export const SA_BANKS: Record<string, SaBank> = {
  standard_bank: {
    id: "standard_bank",
    name: "Standard Bank of South Africa",
    universalBranchCode: "051001",
    accountNumberLengths: [9, 11],
  },
  fnb: {
    id: "fnb",
    name: "First National Bank (FNB)",
    universalBranchCode: "250655",
    accountNumberLengths: [10, 11],
  },
  capitec: {
    id: "capitec",
    name: "Capitec Bank",
    universalBranchCode: "470010",
    accountNumberLengths: [10],
  },
  nedbank: {
    id: "nedbank",
    name: "Nedbank",
    universalBranchCode: "198765",
    accountNumberLengths: [10],
  },
  absa: {
    id: "absa",
    name: "ABSA Bank",
    universalBranchCode: "632005",
    accountNumberLengths: [10],
  },
  investec: {
    id: "investec",
    name: "Investec Bank",
    universalBranchCode: "580105",
    accountNumberLengths: [11],
  },
  tymebank: {
    id: "tymebank",
    name: "TymeBank",
    universalBranchCode: "678910",
    accountNumberLengths: [10],
  },
  african_bank: {
    id: "african_bank",
    name: "African Bank",
    universalBranchCode: "430000",
    accountNumberLengths: [10, 11],
  },
  discovery_bank: {
    id: "discovery_bank",
    name: "Discovery Bank",
    universalBranchCode: "679000",
    accountNumberLengths: [10],
  },
};

export type SaAccountType = "cheque" | "savings" | "transmission";

export interface DriverBankDetails {
  driverId: string;
  bankId: string;
  bankName: string;
  branchCode: string;
  accountNumber: string;
  accountType: SaAccountType;
  accountHolderName: string;
}

export function validateSaBankAccount(params: {
  bankId: string;
  accountNumber: string;
  branchCode?: string;
  accountType: SaAccountType;
}): { valid: boolean; error?: string } {
  const bank = SA_BANKS[params.bankId];
  if (!bank) {
    return { valid: false, error: "Please select a supported South African retail bank" };
  }

  // Account number must contain only digits
  const cleanAcc = params.accountNumber.trim();
  if (!/^\d+$/.test(cleanAcc)) {
    return { valid: false, error: "Account number must contain digits only" };
  }

  if (cleanAcc.length < 7 || cleanAcc.length > 11) {
    return { valid: false, error: "South African bank account numbers must be between 7 and 11 digits" };
  }

  // Branch code validation
  const branch = (params.branchCode || bank.universalBranchCode).trim();
  if (!/^\d{6}$/.test(branch)) {
    return { valid: false, error: "Universal branch code must be exactly 6 digits" };
  }

  return { valid: true };
}

export function maskAccountNumber(acc: string): string {
  const clean = acc.trim();
  if (clean.length < 4) return clean;
  return `${"•".repeat(clean.length - 4)}${clean.slice(-4)}`;
}
