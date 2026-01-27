import { NextRequest } from "next/server";

const LAMBDA_URL = process.env.LAMBDA_URL!;
const API_KEY = process.env.API_KEY!;

const headers = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY,
};

export async function GET() {
  const res = await fetch(LAMBDA_URL, { headers });
  return Response.json(await res.json());
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(LAMBDA_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return Response.json(await res.json(), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(LAMBDA_URL, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  return Response.json(await res.json());
}

export async function DELETE(req: NextRequest) {
  const noteId = req.nextUrl.searchParams.get("noteId");

  const res = await fetch(`${LAMBDA_URL}?noteId=${noteId}`, {
    method: "DELETE",
    headers,
  });

  return Response.json(await res.json());
}
