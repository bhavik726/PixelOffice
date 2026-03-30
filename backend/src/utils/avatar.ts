// Predefined avatar IDs (1-10)
export const AVATAR_IDS = Array.from({ length: 10 }, (_, i) => i + 1);

export function getRandomAvailableAvatar(used: number[]): number {
  const available = AVATAR_IDS.filter((id) => !used.includes(id));
  if (available.length === 0) return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
  return available[Math.floor(Math.random() * available.length)];
}
