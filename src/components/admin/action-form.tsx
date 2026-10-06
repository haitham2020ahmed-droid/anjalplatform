"use client";

import { useState } from "react";

type Props = {
  action: (...args: any[]) => Promise<any>;
  children: React.ReactNode;
};

export function ActionForm({ action, children }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      await action(formData);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {children}

      <button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Submit"}
      </button>
    </form>
  );
}


