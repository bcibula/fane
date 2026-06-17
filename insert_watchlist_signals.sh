#!/bin/bash
# insert_watchlist_signals.sh
# Inserts one BUY signal per watchlist ticker into fane.db.
# Run from VPS: bash insert_watchlist_signals.sh
# Then go to /signals in the Fane UI to approve each one.

DB="$HOME/fane/data/fane.db"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Format: ticker | trigger_reason (macro lens)
# Exchange/currency is informational — actual routing happens at IBKR order time
declare -a SIGNALS=(
  "SU|Energy macro lens — Canadian oil sands, oil price + CAD/USD dynamics (TSX, CAD)"
  "XOM|Energy macro lens — US major, global oil demand and supply (NYSE, USD)"
  "SLB|Energy macro lens — oilfield services, capex cycle proxy (NYSE, USD)"
  "LMT|Defense macro lens — geopolitics and US defense budget proxy (NYSE, USD)"
  "RTX|Defense macro lens — aerospace and defense, sanctions and conflict proxy (NYSE, USD)"
  "NOC|Defense macro lens — defense spending, intra-segment comparison (NYSE, USD)"
  "RY|Financials macro lens — Canadian bank, BoC rate decisions made visible (TSX, CAD)"
  "JPM|Financials macro lens — US bank, Fed rate sensitivity and credit cycle (NYSE, USD)"
  "GS|Financials macro lens — investment bank, capital markets and risk appetite (NYSE, USD)"
  "ABX|Gold macro lens — Canadian miner, inflation hedge and USD inverse (TSX, CAD)"
  "AEM|Gold macro lens — Canadian miner, intra-segment comparison with ABX (TSX, CAD)"
  "FNV|Gold macro lens — royalty company, behaves differently from miners under same gold price (TSX, CAD)"
  "NTR|Agriculture macro lens — Canadian potash, geopolitics to food to inflation (TSX, CAD)"
  "BG|Agriculture macro lens — grain trading, global food supply chain (NYSE, USD)"
  "DE|Agriculture macro lens — farm equipment, agricultural capex cycle (NYSE, USD)"
  "WMT|Consumer staples macro lens — inflation transmission, consumer stress indicator (NYSE, USD)"
  "COST|Consumer staples macro lens — consumer spending, intra-segment comparison (NYSE, USD)"
  "L|Consumer staples macro lens — Canadian retail, domestic inflation and consumer (TSX, CAD)"
  "NVDA|Semiconductors macro lens — AI capex cycle and industrial policy (NASDAQ, USD)"
  "TSM|Semiconductors macro lens — Taiwan geopolitics, global chip supply chain (NYSE, USD)"
  "INTC|Semiconductors macro lens — US industrial policy, intra-segment comparison (NASDAQ, USD)"
  "FTS|Utilities macro lens — Canadian utility, clean BoC rate-sensitivity proxy (TSX, CAD)"
  "NEE|Utilities macro lens — US utility, Fed rate sensitivity and energy transition (NYSE, USD)"
  "DUK|Utilities macro lens — US utility, intra-segment comparison (NYSE, USD)"
  "JNJ|Healthcare macro lens — demographics thread, pharma and medtech (NYSE, USD)"
  "WELL|Healthcare macro lens — senior housing REIT, pure demographics play (NYSE, USD)"
  "TLT|Fixed income macro lens — US long-duration treasury ETF, direct Fed rate instrument (NASDAQ, USD)"
  "XBB|Fixed income macro lens — Canadian bond ETF, direct BoC rate instrument (TSX, CAD)"
  "TECK|Commodities macro lens — Canadian copper and coal, leading industrial cycle indicator (TSX, CAD)"
)

echo "Inserting ${#SIGNALS[@]} watchlist signals into $DB..."
echo ""

for entry in "${SIGNALS[@]}"; do
  TICKER="${entry%%|*}"
  REASON="${entry##*|}"

  sqlite3 "$DB" \
    "INSERT INTO signals (fired_at, ticker, signal_type, direction, trigger_reason, status)
     VALUES ('$NOW', '$TICKER', 'manual', 'BUY', '$REASON', 'pending');"

  echo "  ✓ $TICKER"
done

echo ""
echo "Done. Go to /signals in the Fane UI to approve each one."
echo "Remember: counter-argument and conviction level required at approval time."
