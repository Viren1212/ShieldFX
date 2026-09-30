// ─── SHIELDFX BROKER ADAPTERS ────────────────────────────────────────────────
// Dedicated DOM selectors and heuristic parsers for Zerodha Kite, Groww, Binance, and Universal Web Terminals.

window.ShieldFXBrokerAdapters = {
  // Detect current platform
  detectPlatform() {
    const hostname = window.location.hostname.toLowerCase();
    const href = window.location.href.toLowerCase();

    if (hostname.includes("zerodha") || hostname.includes("kite") || href.includes("broker_demo")) {
      return { id: "zerodha", name: "Zerodha Kite", adapter: this.zerodha };
    }
    if (hostname.includes("groww")) {
      return { id: "groww", name: "Groww", adapter: this.groww };
    }
    if (hostname.includes("binance")) {
      return { id: "binance", name: "Binance", adapter: this.binance };
    }
    if (hostname.includes("upstox")) {
      return { id: "upstox", name: "Upstox Pro", adapter: this.universal };
    }
    if (hostname.includes("angelone")) {
      return { id: "angelone", name: "Angel One", adapter: this.universal };
    }
    if (hostname.includes("tradingview")) {
      return { id: "tradingview", name: "TradingView", adapter: this.universal };
    }
    if (href.includes("shieldfx_simulator") || href.includes("simulator.html") || href.includes("temp.html")){
      return { id: "simulator", name: "ShieldFX Simulator", adapter: this.simulator };
    }

    return { id: "universal", name: "Universal Broker Guard", adapter: this.universal };
  },

  // 1. Zerodha Kite Adapter
  zerodha: {
    isOrderButton(element) {
      if (!element) return false;
      const btn = element.closest("button, .btn, a.btn");
      if (!btn) return false;

      const cls = btn.className.toLowerCase();
      const txt = (btn.innerText || btn.textContent || "").trim().toLowerCase();

      return (
        cls.includes("btn-buy") ||
        cls.includes("btn-sell") ||
        cls.includes("submit") ||
        txt === "buy" ||
        txt === "sell" ||
        txt.includes("place order")
      );
    },

    getOrderDetails(element) {
      const modal = element.closest(".order-window, form, .modal-content, body") || document;
      
      // Extract lot / quantity
      let quantity = 1;
      const qtyInput = modal.querySelector('input[label="Qty."], input[data-balloon*="Quantity"], input[name="quantity"], input[type="number"]');
      if (qtyInput && qtyInput.value) {
        const val = parseFloat(qtyInput.value);
        if (!isNaN(val) && val > 0) quantity = val;
      }

      // Extract direction
      let direction = "BUY";
      const txt = (element.innerText || element.textContent || "").toLowerCase();
      const cls = element.className.toLowerCase();
      if (cls.includes("sell") || txt.includes("sell")) {
        direction = "SELL";
      }

      // Extract symbol
      let symbol = "NIFTY";
      const symEl = modal.querySelector(".instrument-title, .symbol, header .tradingsymbol");
      if (symEl && symEl.textContent) {
        symbol = symEl.textContent.trim().split(" ")[0];
      }

      // Hedge detection: single leg intraday/mis order is usually unhedged naked
      let isUnhedged = 1;
      const hedgeEl = modal.querySelector('input[value="COVER"], input[value="AMO"], input[value="CO"]');
      if (hedgeEl && hedgeEl.checked) {
        isUnhedged = 0; // Cover order has built in stop loss hedge
      }

      return { quantity, direction, symbol, isUnhedged };
    }
  },

  // 2. Groww Adapter
  groww: {
    isOrderButton(element) {
      if (!element) return false;
      const btn = element.closest("button, div[role='button']");
      if (!btn) return false;

      const txt = (btn.innerText || btn.textContent || "").trim().toUpperCase();
      return txt === "BUY" || txt === "SELL" || txt.includes("PLACE ORDER") || txt.includes("BUY ORDER") || txt.includes("SELL ORDER");
    },

    getOrderDetails(element) {
      const container = element.closest("div[class*='orderPad'], div[class*='orderModal'], div[class*='content'], body") || document;

      let quantity = 1;
      const qtyInput = container.querySelector("input[id*='quantity'], input[id*='shares'], input[type='number'], input[inputmode='numeric']");
      if (qtyInput && qtyInput.value) {
        const val = parseFloat(qtyInput.value);
        if (!isNaN(val) && val > 0) quantity = val;
      }

      let direction = "BUY";
      const txt = (element.innerText || element.textContent || "").toUpperCase();
      if (txt.includes("SELL")) direction = "SELL";

      let symbol = "EQUITY/FNO";
      const titleEl = document.querySelector("h1, div[class*='headerTitle'], div[class*='stockName']");
      if (titleEl && titleEl.textContent) {
        symbol = titleEl.textContent.trim().slice(0, 15);
      }

      return { quantity, direction, symbol, isUnhedged: 1 };
    }
  },

  // 3. Binance Adapter (Spot / Futures)
  binance: {
    isOrderButton(element) {
      if (!element) return false;
      const btn = element.closest("button, div[role='button']");
      if (!btn) return false;

      const testId = btn.getAttribute("data-testid") || "";
      const txt = (btn.innerText || btn.textContent || "").trim().toUpperCase();

      return (
        testId.includes("buy-btn") ||
        testId.includes("sell-btn") ||
        testId.includes("place-order") ||
        txt.startsWith("BUY") ||
        txt.startsWith("SELL") ||
        txt.includes("OPEN LONG") ||
        txt.includes("OPEN SHORT")
      );
    },

    getOrderDetails(element) {
      const form = element.closest("form, div[data-testid*='orderForm'], div[class*='OrderForm'], body") || document;

      let quantity = 1;
      const amountInput = form.querySelector("input[id*='unitAmount'], input[data-testid*='amount'], input[type='number']");
      if (amountInput && amountInput.value) {
        const val = parseFloat(amountInput.value);
        if (!isNaN(val) && val > 0) quantity = val;
      }

      let direction = "BUY";
      const txt = (element.innerText || element.textContent || "").toUpperCase();
      if (txt.includes("SELL") || txt.includes("SHORT")) direction = "SELL";

      let symbol = "BTCUSDT";
      const pairEl = document.querySelector("h1, [data-testid*='symbol'], [class*='symbolName']");
      if (pairEl && pairEl.textContent) {
        symbol = pairEl.textContent.trim();
      }

      return { quantity, direction, symbol, isUnhedged: 1 };
    }
  },

  // 4. Simulator Adapter (local test environment)
  simulator: {
    isOrderButton(element) {
      if (!element) return false;
      return Boolean(element.closest("#buyBtn, #sellBtn"));
    },
    getOrderDetails(element) {
      const lotInput = document.getElementById("lotInput");
      const symbolInput = document.getElementById("symbolInput");
      const hedgeSelect = document.getElementById("hedgeSelect");

      return {
        quantity: lotInput ? parseInt(lotInput.value) || 1 : 1,
        direction: element.id === "buyBtn" ? "BUY" : "SELL",
        symbol: symbolInput ? symbolInput.value : "NIFTY",
        isUnhedged: hedgeSelect && hedgeSelect.value === "naked" ? 1 : 0
      };
    }
  },

  // 5. Universal Fallback Heuristic
  universal: {
    isOrderButton(element) {
      if (!element) return false;
      // Exclude ShieldFX's own UI elements
      if (element.closest("#shieldfx-extension-root, #shieldfx-overlay, .shieldfx-hud")) {
        return false;
      }

      const btn = element.closest("button, [role='button'], input[type='submit'], a.btn");
      if (!btn) return false;

      const txt = (btn.innerText || btn.value || btn.textContent || "").trim().toUpperCase();
      const idClass = (btn.id + " " + btn.className).toLowerCase();

      // Common trading action keywords
      const actionKeywords = [
        "BUY", "SELL", "PLACE ORDER", "SUBMIT ORDER", "EXECUTE", 
        "OPEN LONG", "OPEN SHORT", "TRADE NOW", "BUY / LONG", "SELL / SHORT"
      ];

      return actionKeywords.some((kw) => txt === kw || txt.startsWith(kw + " ")) ||
             idClass.includes("buy-button") || idClass.includes("sell-button") || idClass.includes("place-order");
    },

    getOrderDetails(element) {
      const form = element.closest("form, [class*='order'], [class*='trade'], [class*='modal'], body") || document;

      let quantity = 1;
      const inputs = form.querySelectorAll("input[type='number'], input[type='text']");
      for (const inp of inputs) {
        const placeholder = (inp.placeholder || "").toLowerCase();
        const name = (inp.name || "").toLowerCase();
        const label = (inp.getAttribute("aria-label") || "").toLowerCase();

        if (placeholder.includes("qty") || placeholder.includes("lot") || placeholder.includes("quantity") ||
            name.includes("qty") || name.includes("quantity") || label.includes("quantity")) {
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val > 0) {
            quantity = val;
            break;
          }
        }
      }

      const txt = (element.innerText || element.textContent || "").toUpperCase();
      const direction = (txt.includes("SELL") || txt.includes("SHORT")) ? "SELL" : "BUY";

      return {
        quantity,
        direction,
        symbol: "MARKET_ASSET",
        isUnhedged: 1
      };
    }
  }
};
