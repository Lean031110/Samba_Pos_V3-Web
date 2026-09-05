// =====================================================================
// flex-button.js — <flex-button> Web Component
// =====================================================================
// Mirrors Samba.Presentation.Controls.FlexButton behavior:
//   - Auto-contrast foreground (luminance < 128 → white text)
//   - Outer border = Lerp(bgColor, black, 0.3)
//   - Press feedback <100ms (CSS transition + transform + bg flash)
//   - Glow on hover
//
// Usage:
//   <flex-button label="Pay" icon="fa-money-bill-wave" variant="action"
//                onclick="..."></flex-button>
//
// Attributes:
//   label    — button text
//   icon     — Font Awesome 6 icon class (without "fa-solid" prefix, that's added automatically)
//   variant  — semantic variant: success | danger | warning | discount | action | info | default
//   disabled — boolean
//   tall     — tall variant (command bar)
//   size     — xl for big payment buttons
//   bg       — explicit background color (overrides variant)
//   fs       — font size in px (overrides default)
// =====================================================================

class FlexButton extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'icon', 'variant', 'disabled', 'tall', 'size', 'bg', 'fs', 'sublabel'];
  }

  constructor() {
    super();
    this._onClick = null;
  }

  connectedCallback() {
    this._render();
    if (!this._listenerAttached) {
      this.addEventListener('click', this._handleClick.bind(this));
      this._listenerAttached = true;
    }
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  /**
   * Compute foreground color (black or white) from background hex.
   * Uses WCAG luminance formula: L = 0.2126*R + 0.7152*G + 0.0722*B
   * Source: UI_SPECS_FOR_WEB.md section 6.3
   */
  _pickForeground(hexColor) {
    if (!hexColor || !hexColor.startsWith('#')) return null;
    const c = hexColor.replace('#', '');
    if (c.length !== 6) return null;
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 128 ? '#FFFFFF' : '#000000';
  }

  _render() {
    const label = this.getAttribute('label') || '';
    const icon = this.getAttribute('icon');
    const variant = this.getAttribute('variant') || 'default';
    const disabled = this.hasAttribute('disabled');
    const tall = this.hasAttribute('tall');
    const size = this.getAttribute('size');
    const bg = this.getAttribute('bg');
    const fs = this.getAttribute('fs');
    const sublabel = this.getAttribute('sublabel');

    // Determine background and foreground
    let bgColor = bg;
    let fgColor = null;

    if (!bgColor) {
      const variantMap = {
        success:  '#008000',
        danger:   '#FF0000',
        warning:  '#FFA500',
        discount: '#800080',
        action:   '#4169E1',
        info:     '#87CEFA',
        default:  '#DCDCDC',
      };
      bgColor = variantMap[variant] || variantMap.default;
    }
    fgColor = this._pickForeground(bgColor) || '#000000';

    // Build class list
    const classes = ['flex-button'];
    if (variant !== 'default' && !bg) classes.push(`flex-button--${variant}`);
    if (tall) classes.push('flex-button--tall');
    if (size === 'xl') classes.push('flex-button--xl');
    if (disabled) classes.push('is-disabled');

    // Build inner HTML
    let inner = '';
    if (icon) {
      inner += `<i class="fa-solid ${icon} flex-button__icon"></i>`;
    }
    if (label) {
      inner += `<span class="flex-button__label">${this._escapeHtml(label)}</span>`;
    }
    if (sublabel) {
      inner += `<div class="flex-button__sublabel">${this._escapeHtml(sublabel)}</div>`;
    }

    this.className = classes.join(' ');
    this.style.setProperty('--flex-bg', bgColor);
    this.style.setProperty('--flex-fg', fgColor);
    if (fs) this.style.setProperty('--flex-fs', fs + 'px');
    this.innerHTML = inner;
    if (disabled) {
      this.setAttribute('aria-disabled', 'true');
    } else {
      this.removeAttribute('aria-disabled');
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _handleClick(e) {
    if (this.hasAttribute('disabled')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Brief pressed state for visual feedback
    this.classList.add('is-pressed');
    setTimeout(() => this.classList.remove('is-pressed'), 100);
  }
}

customElements.define('flex-button', FlexButton);
