export default function (req, res) {
  // Returns 204 No Content for the successful CORS preflight check.
  // Vercel will attach the necessary Access-Control-Allow-* headers from vercel.json.
  return res.status(204).end();
}
