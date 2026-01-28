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
  try {
    const contentType = req.headers.get("content-type") || "";
    
    let body;
    
    if (contentType.includes("multipart/form-data")) {
      // Handle file uploads with FormData
      const formData = await req.formData();
      
      const res = await fetch(LAMBDA_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY },
        body: formData,
      });

      return Response.json(await res.json(), { status: 201 });
    } else {
      // Handle JSON requests
      body = await req.json();

      const res = await fetch(LAMBDA_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      return Response.json(await res.json(), { status: 201 });
    }
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create note" },
      { status: 500 }
    );
  }
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
