export function naturalSort(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const aArr = a.match(re) || [];
  const bArr = b.match(re) || [];

  for (let i = 0; i < Math.min(aArr.length, bArr.length); i++) {
    const aPart = aArr[i];
    const bPart = bArr[i];

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Both are numbers
      if (aNum !== bNum) {
        return aNum - bNum;
      }
    } else {
      // At least one is not a number, compare as strings
      const cmp = aPart.localeCompare(bPart);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return aArr.length - bArr.length;
}
