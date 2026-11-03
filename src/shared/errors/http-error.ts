export function internalErrorResponse(requestId: string): Response {
  return Response.json(
    { code: "INTERNAL_ERROR", message: "No pudimos completar la solicitud.", requestId },
    { status: 500, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}
