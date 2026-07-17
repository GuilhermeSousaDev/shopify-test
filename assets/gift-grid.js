(function () {
  'use strict';

  // The bundle add-on fires when the selected variant matches EVERY group
  // below (one value per group). Each group lists accepted synonyms, so a
  // size stored as "Medium" or its abbreviation "M" both qualify.
  var BUNDLE_TRIGGER_GROUPS = [
    ['black'],
    ['medium', 'm'],
  ];

  var COLOR_MAP = {
    black: '#0a0a0a',
    white: '#ffffff',
    grey: '#8a8a8a',
    gray: '#8a8a8a',
    blue: '#1030ff',
    navy: '#1a2a6c',
    red: '#d32f2f',
    green: '#2e7d32',
    beige: '#d8c9a3',
    brown: '#795548',
    pink: '#e0409b',
    yellow: '#ffd400',
    orange: '#ff6d00',
    purple: '#7b1fa2',
    silver: '#c0c0c0',
    gold: '#c9a227',
  };
  var INK = '#0a0a0a';

  function swatchAccent(value) {
    var key = String(value).toLowerCase().trim();
    var hex = COLOR_MAP[key];
    if (
      !hex &&
      typeof CSS !== 'undefined' &&
      CSS.supports &&
      CSS.supports('color', key)
    ) {
      hex = key;
    }
    if (!hex) return INK;
    return isLight(hex) ? INK : hex;
  }

  function isLight(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color);
    if (!m) return false;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 200;
  }

  function GiftGrid(section) {
    this.section = section;
    this.popup = document.getElementById(section.dataset.popupId);
    if (!this.popup) return;

    // Cache popup sub-elements once.
    this.els = {
      dialog: this.popup.querySelector('.gift-popup__dialog'),
      image: this.popup.querySelector('[data-popup-image]'),
      title: this.popup.querySelector('[data-popup-title]'),
      price: this.popup.querySelector('[data-popup-price]'),
      desc: this.popup.querySelector('[data-popup-desc]'),
      options: this.popup.querySelector('[data-popup-options]'),
      error: this.popup.querySelector('[data-popup-error]'),
      add: this.popup.querySelector('[data-popup-add]'),
      addLabel: this.popup.querySelector('[data-add-label]'),
    };

    this.product = null; // currently displayed product payload
    this.selection = {}; // { optionName(lower): value }
    this.lastFocused = null; // element to restore focus to on close

    this.bindEvents();
  }

  GiftGrid.prototype.bindEvents = function () {
    var self = this;

    // Open popup from any hotspot inside this section.
    this.section.addEventListener('click', function (e) {
      var hotspot = e.target.closest('[data-hotspot]');
      if (!hotspot) return;
      var tile = hotspot.closest('.gift-grid__item');
      var json = tile && tile.querySelector('[data-product-json]');
      if (!json) return;
      try {
        self.open(JSON.parse(json.textContent), hotspot);
      } catch (err) {
        console.error('[gift-grid] invalid product JSON', err);
      }
    });

    // Close on overlay / close button.
    this.popup.addEventListener('click', function (e) {
      if (e.target.closest('[data-popup-close]')) self.close();
    });

    // Close on ESC, keep focus inside the dialog while open.
    document.addEventListener('keydown', function (e) {
      if (self.popup.hidden) return;
      if (e.key === 'Escape') self.close();
      if (e.key === 'Tab') self.trapFocus(e);
    });

    // Add to cart.
    this.els.add.addEventListener('click', function () {
      self.addToCart();
    });
  };

  /* ---- Open / close --------------------------------------------------- */

  GiftGrid.prototype.open = function (product, trigger) {
    this.product = product;
    this.selection = {};
    this.lastFocused = trigger || document.activeElement;

    this.els.image.src = product.image || '';
    this.els.image.alt = product.title || '';
    this.els.title.textContent = product.title || '';
    this.els.price.textContent = product.price || '';
    this.els.desc.textContent = product.description || '';
    this.resetError();

    this.buildOptions();
    this.updateVariant();

    this.popup.hidden = false;
    document.body.style.overflow = 'hidden'; // prevent background scroll
    // Focus the first interactive control for accessibility.
    var focusable = this.getFocusable();
    if (focusable.length) focusable[0].focus();
  };

  GiftGrid.prototype.close = function () {
    this.popup.hidden = true;
    document.body.style.overflow = '';
    if (this.lastFocused && typeof this.lastFocused.focus === 'function') {
      this.lastFocused.focus();
    }
  };

  /* ---- Variant option controls --------------------------------------- */

  GiftGrid.prototype.buildOptions = function () {
    var self = this;
    var options = this.product.options || [];
    this.els.options.innerHTML = '';

    options.forEach(function (option) {
      var key = option.name.toLowerCase();
      // Default selection = first value for each option.
      self.selection[key] = option.values[0];

      var group = document.createElement('div');
      group.className = 'gift-popup__group';

      var label = document.createElement('span');
      label.className = 'gift-popup__group-label';
      label.textContent = option.name;
      group.appendChild(label);

      // "Size" -> dropdown; everything else (Color, ...) -> swatch buttons.
      if (key.indexOf('size') !== -1) {
        group.appendChild(self.buildSelect(option, key));
      } else {
        group.appendChild(self.buildSwatches(option, key));
      }

      self.els.options.appendChild(group);
    });
  };

  // Swatch buttons (used for Color and any non-size option).
  GiftGrid.prototype.buildSwatches = function (option, key) {
    var self = this;
    var wrap = document.createElement('div');
    wrap.className = 'gift-popup__swatches';

    option.values.forEach(function (value, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gift-popup__swatch';
      btn.textContent = value;
      btn.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
      // Per-swatch accent used by the selected-state styling.
      btn.style.setProperty('--swatch-accent', swatchAccent(value));
      btn.addEventListener('click', function () {
        self.selection[key] = value;
        // Reflect pressed state across the group.
        wrap.querySelectorAll('.gift-popup__swatch').forEach(function (el) {
          el.setAttribute('aria-pressed', el === btn ? 'true' : 'false');
        });
        self.updateVariant();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  };

  // Dropdown (used for Size). Starts on a neutral "Choose your size" prompt.
  GiftGrid.prototype.buildSelect = function (option, key) {
    var self = this;
    var select = document.createElement('select');
    select.className = 'gift-popup__select';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose your ' + option.name.toLowerCase();
    select.appendChild(placeholder);

    option.values.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });

    // No default size selected so the shopper must choose one.
    self.selection[key] = '';

    select.addEventListener('change', function () {
      self.selection[key] = select.value;
      self.updateVariant();
    });
    return select;
  };

  /* ---- Variant resolution -------------------------------------------- */

  // Find the variant whose option values match the current selection.
  GiftGrid.prototype.getSelectedVariant = function () {
    var options = this.product.options || [];
    var selection = this.selection;
    return (
      (this.product.variants || []).find(function (variant) {
        return options.every(function (option, i) {
          var chosen = selection[option.name.toLowerCase()];
          return chosen && variant.options[i] === chosen;
        });
      }) || null
    );
  };

  // Keep the price + Add-to-cart button in sync with the current selection.
  GiftGrid.prototype.updateVariant = function () {
    var variant = this.getSelectedVariant();
    var allChosen = (this.product.options || []).every(function (o) {
      return !!this.selection[o.name.toLowerCase()];
    }, this);

    if (variant) {
      this.els.price.textContent = variant.price;
    }

    var addable = variant && variant.available;
    this.els.add.disabled = !addable;
    this.els.addLabel.textContent =
      variant && !variant.available ? 'SOLD OUT' : 'ADD TO CART';

    if (allChosen && variant && !variant.available) {
      this.showError('This combination is sold out.');
    } else {
      this.resetError();
    }
  };

  /* ---- Add to cart ---------------------------------------------------- */

  GiftGrid.prototype.addToCart = function () {
    var self = this;
    var variant = this.getSelectedVariant();

    // Guard: require a complete, available selection.
    var missing = (this.product.options || []).some(function (o) {
      return !this.selection[o.name.toLowerCase()];
    }, this);
    if (missing || !variant) {
      this.showError('Please choose all options first.');
      return;
    }
    if (!variant.available) {
      this.showError('This combination is sold out.');
      return;
    }

    var items = [{ id: variant.id, quantity: 1 }];

    // Bundle rule: Black + Medium also adds the section's bundle product.
    if (this.shouldBundle(variant)) {
      var bundleId = parseInt(this.section.dataset.bundleVariant, 10);
      if (bundleId) items.push({ id: bundleId, quantity: 1 });
    }

    this.setLoading(true);
    fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items: items }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok)
            throw new Error(data.description || 'Unable to add to cart.');
          return data;
        });
      })
      .then(function () {
        self.onAdded();
      })
      .catch(function (err) {
        self.showError(err.message || 'Something went wrong.');
      })
      .finally(function () {
        self.setLoading(false);
      });
  };

  // True when the selected variant satisfies every trigger group (e.g. a
  // "Black" value AND a "Medium"/"M" value).
  GiftGrid.prototype.shouldBundle = function (variant) {
    if (!this.section.dataset.bundleVariant) return false;
    var values = variant.options.map(function (v) {
      return String(v).toLowerCase().trim();
    });
    return BUNDLE_TRIGGER_GROUPS.every(function (group) {
      return group.some(function (name) {
        return values.indexOf(name) !== -1;
      });
    });
  };

  // Success feedback + let the theme know the cart changed.
  GiftGrid.prototype.onAdded = function () {
    var self = this;
    this.els.addLabel.textContent = 'ADDED ✓';
    this.refreshCartUI();

    setTimeout(function () {
      self.els.addLabel.textContent = 'ADD TO CART';
      self.close();
    }, 900);
  };

  /* ---- Cart UI refresh ------------------------------------------------ */

  // Nudge the host theme to update its cart bubble / drawer. We stay generic:
  // publish the events common themes listen for, and update any element that
  // exposes the item count, so this works without hard-wiring to Horizon.
  GiftGrid.prototype.refreshCartUI = function () {
    fetch('/cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        document
          .querySelectorAll('.cart-count-bubble, [data-cart-count]')
          .forEach(function (el) {
            el.textContent = cart.item_count;
          });
        // Fire widely-used cart events so theme scripts can react.
        document.dispatchEvent(
          new CustomEvent('cart:refresh', { bubbles: true, detail: cart }),
        );
        document.dispatchEvent(
          new CustomEvent('cart:build', { bubbles: true, detail: cart }),
        );
        if (
          window.Shopify &&
          typeof window.Shopify.onCartUpdate === 'function'
        ) {
          window.Shopify.onCartUpdate(cart);
        }
      })
      .catch(function () {
        /* non-fatal: item is already in the cart */
      });
  };

  /* ---- Small helpers -------------------------------------------------- */

  GiftGrid.prototype.setLoading = function (loading) {
    this.els.add.disabled = loading;
    this.els.add.setAttribute('aria-busy', loading ? 'true' : 'false');
  };

  GiftGrid.prototype.showError = function (message) {
    this.els.error.textContent = message;
    this.els.error.hidden = false;
  };

  GiftGrid.prototype.resetError = function () {
    this.els.error.textContent = '';
    this.els.error.hidden = true;
  };

  GiftGrid.prototype.getFocusable = function () {
    return Array.prototype.slice
      .call(
        this.els.dialog.querySelectorAll(
          'button, [href], select, input, [tabindex]:not([tabindex="-1"])',
        ),
      )
      .filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
  };

  // Simple focus trap so keyboard users stay within the open dialog.
  GiftGrid.prototype.trapFocus = function (e) {
    var focusable = this.getFocusable();
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* ----------------------------------------------------------------------
   * Boot: initialise every Gift Grid section (also re-runs in the theme
   * editor when a section is added or reloaded).
   * -------------------------------------------------------------------- */
  function init(scope) {
    (scope || document)
      .querySelectorAll('[data-gift-grid]')
      .forEach(function (section) {
        if (section.dataset.giftGridReady) return;
        section.dataset.giftGridReady = 'true';
        new GiftGrid(section);
      });
  }

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  }

  // Shopify theme editor lifecycle events.
  document.addEventListener('shopify:section:load', function (e) {
    init(e.target);
  });
})();
