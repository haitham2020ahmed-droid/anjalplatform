import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateQuestions(
  skill: string,
  count: number
) {
  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `
Create ${count} multiple choice English questions.

Skill:
${skill}

Return JSON only.

Format:
[
  {
    "question": "",
    "options": [
      "",
      "",
      "",
      ""
    ],
    "correctAnswer": "",
    "explanation": ""
  }
]
        `,
      },
    ],
  });

  const block = response.content.find(
    (item) => item.type === "text"
  );

  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text");
  }

  return block.text;
}
