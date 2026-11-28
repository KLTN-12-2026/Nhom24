// Nguồn duy nhất cho màu, font và cấu hình ConfigProvider của Ant Design.
// Biến CSS (--c-*) được ghi vào :root bởi applyCssVars() để index.css và style nội tuyến dùng chung.

export const palette = {
  paper: '#FAF8F5', // nền trang (trắng ngà ấm)
  paper2: '#F3F0EA', // nền phụ: tiêu đề bảng, ô nhập bị khóa
  surface: '#FFFFFF', // nền thẻ, ô nhập
  ink: '#1C1917', // chữ chính (đen mực)
  ink2: '#57534E', // chữ phụ
  ink3: '#6F6963', // chú thích, nhãn (v1.24: đậm hơn để đạt 4.5:1 trên paper2 và accentSoft)
  line: '#E7E2DA', // viền mảnh
  lineStrong: '#D3CCC0', // đường kẻ đậm, viền nút (trang trí)
  controlBorder: '#8A8379', // viền ô nhập, hộp chọn: 3:1 trở lên so với nền (WCAG 1.4.11)
  placeholder: '#767069', // chữ gợi ý trong ô nhập: 4.5:1 trên nền trắng
  accent: '#0F766E', // màu nhấn duy nhất (xanh ngọc đậm)
  accentHover: '#0B5F58',
  accentSoft: '#E5F1EF', // nền nhạt của màu nhấn
  accentLine: '#B7D8D3',
  danger: '#B42318',
  dangerSoft: '#FBEAE8',
  dangerLine: '#EFC3BE',
  warn: '#92580A',
  warnSoft: '#FBF0DC',
  warnLine: '#EBD3A8',
};

// Điểm phù hợp: một màu xanh ngọc, đậm nhạt theo mức (không dùng cầu vồng)
export const scoreShade = {
  excellent: '#0F766E',
  good: '#3F9188',
  fair: '#8DBBB5',
  low: '#C4BEB3',
};

export const fontFamily =
  "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const cssVarMap = {
  '--c-paper': palette.paper,
  '--c-paper-2': palette.paper2,
  '--c-surface': palette.surface,
  '--c-ink': palette.ink,
  '--c-ink-2': palette.ink2,
  '--c-ink-3': palette.ink3,
  '--c-line': palette.line,
  '--c-line-strong': palette.lineStrong,
  '--c-control-border': palette.controlBorder,
  '--c-placeholder': palette.placeholder,
  '--c-accent': palette.accent,
  '--c-accent-hover': palette.accentHover,
  '--c-accent-soft': palette.accentSoft,
  '--c-accent-line': palette.accentLine,
  '--c-danger': palette.danger,
  '--c-danger-soft': palette.dangerSoft,
  '--c-danger-line': palette.dangerLine,
  '--c-warn': palette.warn,
  '--c-warn-soft': palette.warnSoft,
  '--c-warn-line': palette.warnLine,
  '--font': fontFamily,
};

export function applyCssVars(root = document.documentElement) {
  Object.entries(cssVarMap).forEach(([k, v]) => root.style.setProperty(k, v));
}

const theme = {
  token: {
    colorPrimary: palette.accent,
    colorInfo: palette.accent,
    colorSuccess: palette.accent,
    colorWarning: palette.warn,
    colorError: palette.danger,
    colorLink: palette.accent,
    colorLinkHover: palette.accentHover,
    colorText: palette.ink,
    colorTextSecondary: palette.ink2,
    colorTextTertiary: palette.ink3,
    colorTextDescription: palette.ink3,
    colorTextPlaceholder: palette.placeholder,
    colorBgBase: palette.surface,
    colorBgLayout: palette.paper,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.surface,
    colorBorder: palette.controlBorder,
    colorBorderSecondary: palette.line,
    colorSplit: palette.line,
    colorFillAlter: palette.paper2,
    colorFillSecondary: palette.paper2,
    colorFillTertiary: palette.paper2,
    colorFillQuaternary: palette.paper,
    fontFamily,
    fontSize: 14,
    fontSizeHeading1: 32,
    fontSizeHeading2: 26,
    fontSizeHeading3: 22,
    fontSizeHeading4: 18,
    fontSizeHeading5: 15,
    lineHeight: 1.6,
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 6,
    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,
    padding: 16,
    paddingLG: 24,
    margin: 16,
    boxShadow: 'none',
    boxShadowSecondary: '0 4px 16px rgba(28, 25, 23, 0.08)',
    boxShadowTertiary: 'none',
    controlOutline: 'rgba(15, 118, 110, 0.18)',
    controlOutlineWidth: 2,
    motionDurationMid: '0.15s',
    wireframe: false,
  },
  components: {
    Button: {
      fontWeight: 600,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      defaultBorderColor: palette.lineStrong,
      defaultColor: palette.ink,
      defaultHoverBorderColor: palette.accent,
      defaultHoverColor: palette.accent,
      paddingInline: 16,
    },
    Card: {
      headerFontSize: 15,
      headerHeight: 48,
      paddingLG: 20,
      boxShadowTertiary: 'none',
      colorBorderSecondary: palette.line,
    },
    Table: {
      headerBg: palette.paper2,
      headerColor: palette.ink2,
      headerSplitColor: 'transparent',
      borderColor: palette.line,
      rowHoverBg: palette.paper,
      cellPaddingBlock: 12,
      cellPaddingInline: 14,
    },
    Tag: {
      defaultBg: palette.surface,
      defaultColor: palette.ink2,
      borderRadiusSM: 4,
      fontSizeSM: 12,
    },
    Menu: {
      itemBorderRadius: 4,
      itemSelectedBg: palette.accentSoft,
      itemSelectedColor: palette.accent,
      itemHoverBg: palette.paper2,
      itemColor: palette.ink2,
      itemHeight: 38,
      activeBarBorderWidth: 0,
    },
    Input: {
      activeShadow: '0 0 0 2px rgba(15, 118, 110, 0.18)',
      hoverBorderColor: palette.accent,
      activeBorderColor: palette.accent,
      paddingInline: 12,
    },
    Select: {
      optionSelectedBg: palette.accentSoft,
      optionSelectedColor: palette.ink,
      optionActiveBg: palette.paper2,
    },
    Modal: {
      borderRadiusLG: 8,
      titleFontSize: 17,
      headerBg: palette.surface,
    },
    Tabs: {
      inkBarColor: palette.accent,
      itemSelectedColor: palette.accent,
      itemHoverColor: palette.accentHover,
      itemColor: palette.ink2,
      titleFontSize: 14,
    },
    Rate: {
      starColor: palette.warn,
      starBg: palette.line,
    },
    Collapse: {
      headerBg: palette.surface,
      contentBg: palette.surface,
    },
    Alert: {
      borderRadiusLG: 6,
    },
    Pagination: {
      itemActiveBg: palette.accentSoft,
    },
    Progress: {
      defaultColor: palette.accent,
      remainingColor: palette.line,
    },
    Skeleton: {
      gradientFromColor: palette.paper2,
      gradientToColor: palette.line,
    },
  },
};

export default theme;
