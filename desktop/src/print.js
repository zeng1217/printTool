// 自定义尺寸打印。老版把 70×50mm 写死在 CSS 里，这里改成按配置动态生成。
// 约定：paperW × paperH 为打印机进纸物理尺寸（mm，纵向），
// 内容按横向（paperH 宽 × paperW 高）排版，打印时顺时针旋转 90° 填入进纸槽，
// 与老版汉印 N31L 的对齐方式一致。

export function buildPrintCss(paperW, paperH) {
  const contentW = paperH; // 内容盒宽（= layout.Wd）
  const contentH = paperW; // 内容盒高（= layout.Hd）
  return `
    @page {
      size: ${paperW}mm ${paperH}mm portrait;
      margin: 0 !important;
    }
    html, body {
      width: ${paperW}mm !important;
      height: ${paperH}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      overflow: hidden !important;
    }
    body > *:not(#print-root) { display: none !important; }
    #print-root {
      display: block !important;
      position: absolute !important;
      left: 0 !important; top: 0 !important;
      width: ${paperW}mm !important;
      height: ${paperH}mm !important;
      overflow: hidden !important;
      margin: 0 !important; padding: 0 !important;
    }
    /* 内容盒按横向 Wd×Hd 排版，顺时针旋转 90° 填入纵向进纸 */
    #printableTicket {
      position: absolute !important;
      left: 0 !important; top: 0 !important;
      width: ${contentW}mm !important;
      height: ${contentH}mm !important;
      margin: 0 !important; padding: 0 !important;
      border: none !important; box-shadow: none !important;
      transform-origin: top left !important;
      transform: rotate(90deg) translateY(-${contentH}mm) !important;
    }
  `;
}

// 屏幕预览用的票据盒尺寸（横向内容尺寸，供界面展示）
export function previewSize(paperW, paperH) {
  return { width: `${paperH}mm`, height: `${paperW}mm` };
}

// 调起打印：先按配置注入 @page 样式，再 window.print()
// Windows(WebView2) 支持 window.print()；macOS WKWebView 打印支持有限，
// 正式发行时若需 mac 静默打印要另接系统打印，这里先复用浏览器打印链路。
export function printTicket(css) {
  let tag = document.getElementById('dynamicPrintCss');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'dynamicPrintCss';
    document.head.appendChild(tag);
  }
  tag.textContent = css;
  window.focus();
  window.print();
}
