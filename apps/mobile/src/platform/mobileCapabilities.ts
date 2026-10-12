export interface MobileCapabilities {
  canPickDocuments: boolean;
  canShareFiles: boolean;
  durableStorage: 'pending' | 'sqlite';
  primaryTarget: 'android-first-ios-compatible';
}

export const mobileCapabilities: MobileCapabilities = {
  canPickDocuments: true,
  canShareFiles: true,
  durableStorage: 'sqlite',
  primaryTarget: 'android-first-ios-compatible',
};
