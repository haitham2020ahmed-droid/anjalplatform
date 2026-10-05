import { NextResponse } from "next/server";
import { generateQuestions } from "@/server/ai/question-generator";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const skill = body.skill;
    const count = body.count;

    if (!skill || !count) {
      return NextResponse.json(
        { error: "Skill and count are required" },
        { status: 400 }
      );
    }

    const result = await generateQuestions(
      skill,
      Number(count)
    );

    return NextResponse.json({
      success: true,
      questions: result,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
