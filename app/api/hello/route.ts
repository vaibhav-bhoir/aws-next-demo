export async function GET() {
  try {
    // Check if LAMBDA_URL is defined
    if (!process.env.LAMBDA_URL) {
      return Response.json(
        {
          error: "LAMBDA_URL environment variable is not defined",
          source: "next-api"
        },
        { status: 500 }
      );
    }

    const res = await fetch(process.env.LAMBDA_URL, {
      method: "GET",
    });

    if (!res.ok) {
      throw new Error(`Lambda request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    return Response.json({
      source: "next-api",
      data,
    });
  } catch (error) {
    console.error('API route error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        source: "next-api"
      },
      { status: 500 }
    );
  }
}
