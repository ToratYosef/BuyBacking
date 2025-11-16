(() => {
  const styleId = "shc-shared-layout";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      :root {
        --shc-indigo: #5b21b6;
        --shc-navy: #0f172a;
        --shc-slate: #1f2937;
        --shc-ice: #f8fafc;
      }
      .shc-global-header {
        position: sticky;
        top: 0;
        z-index: 100;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid #e5e7eb;
        box-shadow: 0 10px 30px -20px rgba(0,0,0,0.3);
      }
      .shc-header-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        gap: 16px;
      }
      .shc-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        color: var(--shc-slate);
        text-decoration: none;
        letter-spacing: -0.02em;
      }
      .shc-brand img { height: 40px; width: 40px; object-fit: contain; }
      .shc-nav {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .shc-nav a {
        color: #334155;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 12px;
        border-radius: 10px;
        transition: all .2s ease;
      }
      .shc-nav a:hover { color: var(--shc-indigo); background: #ede9fe; }
      .shc-cta {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 18px;
        border-radius: 12px;
        background: linear-gradient(120deg,#7c3aed,#22d3ee);
        color: white !important;
        text-decoration: none;
        font-weight: 700;
        box-shadow: 0 10px 20px -12px rgba(124,58,237,0.6);
      }
      .shc-global-footer {
        background: #0b1224;
        color: #e2e8f0;
        padding: 48px 20px 30px;
        margin-top: 64px;
      }
      .shc-footer-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit,minmax(180px,1fr));
        gap: 28px;
      }
      .shc-footer-top {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .shc-footer-top p { color: #cbd5e1; line-height: 1.6; }
      .shc-footer-col h4 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 12px; }
      .shc-footer-col ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
      .shc-footer-col a { color: #e2e8f0; text-decoration: none; font-weight: 600; }
      .shc-footer-col a:hover { color: #a5b4fc; }
      .shc-footer-bottom { max-width: 1200px; margin: 28px auto 0; padding-top: 18px; border-top: 1px solid #1f2937; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; color: #94a3b8; font-size: 14px; }
      @media (max-width: 768px) {
        .shc-header-inner { flex-direction: column; align-items: flex-start; }
        .shc-nav { width: 100%; justify-content: space-between; }
      }
    `;
    document.head.appendChild(style);
  }

  const headerHtml = `
    <header class="shc-global-header">
      <div class="shc-header-inner">
        <a class="shc-brand" href="/">
          <img src="/assets/logo.png" alt="SecondHandCell logo" loading="lazy" />
          <div>
            <div>SecondHandCell</div>
            <small style="display:block;color:#6366f1;font-weight:700;">Sell • Upgrade • Protect</small>
          </div>
        </a>
        <nav class="shc-nav" aria-label="Primary">
          <a href="/sell-device.html">Sell Device</a>
          <a href="/popular-devices.html">Popular Devices</a>
          <a href="/iphone/">iPhone</a>
          <a href="/samsung/">Samsung</a>
          <a href="/ipad/">iPad</a>
          <a href="/login.html">My Account</a>
          <a class="shc-cta" href="/sell-device.html">Get My Offer</a>
        </nav>
      </div>
    </header>
  `;

  const footerHtml = `
    <footer class="shc-global-footer">
      <div class="shc-footer-inner">
        <div class="shc-footer-top">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="/assets/logo.png" alt="SecondHandCell" style="height:44px;width:44px;object-fit:contain;">
            <div>
              <div style="font-weight:800;font-size:18px;">SecondHandCell</div>
              <div style="color:#c7d2fe;font-weight:600;">Turn your old phone into cash</div>
            </div>
          </div>
          <p>Simple, safe, and fast device buybacks. Transparent pricing, prepaid shipping, and friendly support—every step of the way.</p>
        </div>
        <div class="shc-footer-col">
          <h4>Coverage</h4>
          <ul>
            <li><a href="/sell-device.html">Sell Your Device</a></li>
            <li><a href="/popular-devices.html">Popular Devices</a></li>
            <li><a href="/ipad/">iPad Trade-Ins</a></li>
            <li><a href="/samsung/">Samsung Offers</a></li>
          </ul>
        </div>
        <div class="shc-footer-col">
          <h4>Support</h4>
          <ul>
            <li><a href="mailto:support@secondhandcell.com">Email Support</a></li>
            <li><a href="/login.html">Customer Portal</a></li>
            <li><a href="/privacy.html#faq">FAQ</a></li>
            <li><a href="/order-submitted.html">Track My Kit</a></li>
          </ul>
        </div>
        <div class="shc-footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="/privacy.html">Privacy Policy</a></li>
            <li><a href="/terms.html">Terms of Service</a></li>
            <li><a href="https://www.trustpilot.com/evaluate/secondhandcell.com" target="_blank" rel="noreferrer">Trustpilot Reviews</a></li>
            <li><a href="/unsubscribe/">Unsubscribe</a></li>
          </ul>
        </div>
      </div>
      <div class="shc-footer-bottom">
        <span>© ${new Date().getFullYear()} SecondHandCell. All rights reserved.</span>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="/terms.html" style="color:#cbd5e1;">Terms</a>
          <a href="/privacy.html" style="color:#cbd5e1;">Privacy</a>
          <a href="/unsubscribe/" style="color:#cbd5e1;">Email Preferences</a>
        </div>
      </div>
    </footer>
  `;

  const appendIfMissing = (selector, html, position = 'afterbegin') => {
    if (!document.querySelector(selector)) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html.trim();
      const element = wrapper.firstElementChild;
      if (position === 'afterbegin') {
        document.body.insertBefore(element, document.body.firstChild);
      } else {
        document.body.appendChild(element);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      appendIfMissing('.shc-global-header', headerHtml, 'afterbegin');
      appendIfMissing('.shc-global-footer', footerHtml, 'beforeend');
    });
  } else {
    appendIfMissing('.shc-global-header', headerHtml, 'afterbegin');
    appendIfMissing('.shc-global-footer', footerHtml, 'beforeend');
  }
})();
