export function handleErrorResponse(e, res, errorHint) {
  const errorMessage = `Error occurred${
    errorHint ? " (" + errorHint + ")" : ""
  }`;
  console.error(errorMessage, e);
  return res.status(500).json({ success: false, error: errorMessage });
}
