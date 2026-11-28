import { useRef } from 'react';

/**
 * Bàn phím cho Popover dạng menu / bảng (antd chỉ mở bằng click): mở thì chuyển focus vào điều khiển đầu tiên của bảng,
 * Esc đóng và trả focus về nút mở. `setOpen` là hàm đóng / mở của nơi dùng.
 * Dùng: <Popover {...popoverProps} content={<div {...panelProps}>...</div>}><Button ref={triggerRef} /></Popover>
 */
export default function usePopoverFocus(setOpen) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  return {
    triggerRef,
    popoverProps: {
      afterOpenChange: (open) => {
        if (open) panelRef.current?.querySelector('button:not(:disabled), a[href]')?.focus();
      },
    },
    panelProps: {
      ref: panelRef,
      onKeyDown: (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      },
    },
  };
}
