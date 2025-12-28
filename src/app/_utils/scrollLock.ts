// 스크롤 잠금을 스택으로 관리
let scrollLockCount = 0;
let originalOverflow = '';

export const lockScroll = () => {
  scrollLockCount++;
  if (scrollLockCount === 1) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
};

export const unlockScroll = () => {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = originalOverflow || '';
  }
};

