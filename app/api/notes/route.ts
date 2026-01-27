import { NextRequest } from "next/server";

const LAMBDA_URL = process.env.LAMBDA_URL!;

export async function GET() {
  const res = await fetch(LAMBDA_URL);
  return Response.json(await res.json());
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(LAMBDA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return Response.json(await res.json(), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(LAMBDA_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return Response.json(await res.json());
}

export async function DELETE(req: NextRequest) {
  const noteId = req.nextUrl.searchParams.get("noteId");

  const res = await fetch(`${LAMBDA_URL}?noteId=${noteId}`, {
    method: "DELETE",
  });

  return Response.json(await res.json());
}
