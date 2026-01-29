import { NextRequest } from "next/server";

const LAMBDA_URL = process.env.LAMBDA_URL;
const API_KEY = process.env.API_KEY;

if (!LAMBDA_URL || !API_KEY) {
  console.error("Missing environment variables:", { LAMBDA_URL: !!LAMBDA_URL, API_KEY: !!API_KEY });
}

const headers = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY || "",
};

export async function GET() {
  if (!LAMBDA_URL) {
    return Response.json({ error: "LAMBDA_URL not configured" }, { status: 500 });
  }
  const res = await fetch(LAMBDA_URL, { headers });
  return Response.json(await res.json());
}

export async function POST(req: NextRequest) {
  try {
    if (!LAMBDA_URL) {
      return Response.json({ error: "LAMBDA_URL not configured" }, { status: 500 });
    }

    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("multipart/form-data")) {
      // Handle file uploads with FormData
      const formData = await req.formData();
      
      const res = await fetch(LAMBDA_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY || "" },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Lambda error:", errorText);
        return Response.json({ error: errorText }, { status: res.status });
      }

      return Response.json(await res.json(), { status: 201 });
    } else {
      // Handle JSON requests
      const body = await req.json();

      const res = await fetch(LAMBDA_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Lambda error:", errorText);
        return Response.json({ error: errorText }, { status: res.status });
      }

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
  if (!LAMBDA_URL) {
    return Response.json({ error: "LAMBDA_URL not configured" }, { status: 500 });
  }
  
  const body = await req.json();

  const res = await fetch(LAMBDA_URL, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  return Response.json(await res.json());
}

export async function DELETE(req: NextRequest) {
  if (!LAMBDA_URL) {
    return Response.json({ error: "LAMBDA_URL not configured" }, { status: 500 });
  }

  const noteId = req.nextUrl.searchParams.get("noteId");

  const res = await fetch(`${LAMBDA_URL}?noteId=${noteId}`, {
    method: "DELETE",
    headers,
  });

  return Response.json(await res.json());
}
