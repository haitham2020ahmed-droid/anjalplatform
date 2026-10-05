"use client";

import { useState } from "react";

export default function AIQuestionGenerator() {
  const [skill, setSkill] = useState("");
  const [count, setCount] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function generate() {
    setLoading(true);

    const response = await fetch("/api/questions/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        skill,
        count,
      }),
    });

    const data = await response.json();

    setResult(JSON.stringify(data, null, 2));
    setLoading(false);
  }

  return (
    <div className="mb-6 rounded-xl border p-6">
      <h2 className="text-xl font-bold mb-4">
        Generate Questions with AI
      </h2>

      <input
        className="border p-2 w-full mb-3"
        placeholder="Skill e.g. Main Idea"
        value={skill}
        onChange={(e) => setSkill(e.target.value)}
      />

      <input
        className="border p-2 w-full mb-3"
        type="number"
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
      />

      <button
        onClick={generate}
        className="bg-blue-600 text-white px-5 py-2 rounded-lg"
      >
        {loading ? "Generating..." : "Generate with AI"}
      </button>

      {result && (
        <pre className="mt-5 bg-gray-100 p-4 rounded">
          {result}
        </pre>
      )}
    </div>
  );
}
