"use client";

import { useState, useTransition } from "react";
import { unlockAction } from "@/app/actions/auth";
import { Icon } from "@/components/icons";

export function PinPad() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function press(digit: string) {
    if (pin.length >= 8) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length >= 4) submitIfComplete(next);
  }

  function submitIfComplete(value: string) {
    // Try at 4 digits and on every digit after — most PINs are 4 or 6.
    startTransition(async () => {
      const data = new FormData();
      data.set("pin", value);
      const result = await unlockAction({}, data);
      if (result?.error && value.length >= 6) {
        setError(result.error);
        setPin("");
      }
    });
  }

  return (
    <div className="stack">
      <div className="pindots" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} data-filled={i < pin.length} />
        ))}
      </div>
      {error && <div className="notice error" role="alert"><Icon name="alert" />{error}</div>}
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" onClick={() => press(digit)} disabled={pending}>
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="blank"
          onClick={() => submitIfComplete(pin)}
          disabled={pending || pin.length < 4}
          style={{ color: "var(--jade)" }}
        >
          Unlock
        </button>
        <button type="button" onClick={() => press("0")} disabled={pending}>0</button>
        <button type="button" className="blank" onClick={() => { setPin(pin.slice(0, -1)); setError(null); }} aria-label="Delete">
          <Icon name="back" size={20} />
        </button>
      </div>
    </div>
  );
}
