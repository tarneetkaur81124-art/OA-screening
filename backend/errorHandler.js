// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }

  // Postgres unique_violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate record', detail: err.detail });
  }
  // Postgres foreign_key_violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist', detail: err.detail });
  }

  res.status(err.status || 500).json({
    error: err.publicMessage || 'Internal server error',
  });
}

module.exports = { errorHandler };
