'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { lockScroll, unlockScroll } from '@/app/_utils/scrollLock';

type ModalOptions = {
  dismissOnBackdrop?: boolean;
  dismissOnEsc?: boolean;
  /** 모달 너비를 지정하는 Tailwind max-width 클래스 (기본값: 'max-w-md') */
  size?: string;
};

type OpenModalArgs = {
  content: React.ReactNode;
  options?: ModalOptions;
};

type ModalContextType = {
  open: (args: OpenModalArgs) => void;
  close: () => void;
  isOpen: boolean;
  /** 열려 있는 모달의 너비를 동적으로 변경 (예: 폼 내용에 따라 넓혀야 할 때) */
  setSize: (size: string) => void;
};

const DEFAULT_MODAL_SIZE = 'max-w-md';

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<React.ReactNode>(null);
  const [size, setSize] = useState<string>(DEFAULT_MODAL_SIZE);
  const [options, setOptions] = useState<ModalOptions>({
    dismissOnBackdrop: true,
    dismissOnEsc: true,
  });
  const modalRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    modalRootRef.current = root;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (options.dismissOnEsc !== false && e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    lockScroll();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      unlockScroll();
    };
  }, [isOpen, options.dismissOnEsc]);

  const open = useCallback(
    ({ content: node, options: opts }: OpenModalArgs) => {
      setContent(node);
      if (opts) setOptions((prev) => ({ ...prev, ...opts }));
      setSize(opts?.size ?? DEFAULT_MODAL_SIZE);
      setIsOpen(true);
    },
    []
  );

  const close = useCallback(() => {
    setIsOpen(false);
    // Optionally clear content after close animation; instant for simplicity
    setContent(null);
    setSize(DEFAULT_MODAL_SIZE);
  }, []);

  const value = useMemo(
    () => ({ open, close, isOpen, setSize }),
    [open, close, isOpen, setSize]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      {isOpen &&
        modalRootRef.current &&
        createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                if (options.dismissOnBackdrop !== false) close();
              }}
            />
            <div
              className={`relative z-[2001] max-h-[90vh] w-[90vw] ${size} flex flex-col rounded-lg bg-white p-4 shadow-xl`}
            >
              {content}
            </div>
          </div>,
          modalRootRef.current
        )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
