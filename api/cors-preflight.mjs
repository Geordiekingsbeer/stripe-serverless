export default function (req, res) {
  // Returns 204 No Content for the successful CORS preflight check.
  return res.status(204).end();
}
