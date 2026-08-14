// Prosta walidacja req.body bez zewnętrznych zależności

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Waliduje obiekt według schematu
// Schema: { pole: { type, required, max, min, enum, match } }
export function validate(data, schema) {
  for (const [field, rules] of Object.entries(schema)) {
    const val = data[field];

    if (rules.required && (val === undefined || val === null || val === '')) {
      throw new ValidationError(`Pole "${field}" jest wymagane`);
    }
    if (val === undefined || val === null || val === '') continue;

    if (rules.type === 'string') {
      if (typeof val !== 'string') throw new ValidationError(`Pole "${field}" musi być tekstem`);
      const trimmed = val.trim();
      if (rules.max && trimmed.length > rules.max)
        throw new ValidationError(`Pole "${field}" może mieć maksymalnie ${rules.max} znaków`);
      if (rules.min && trimmed.length < rules.min)
        throw new ValidationError(`Pole "${field}" musi mieć co najmniej ${rules.min} znaków`);
      if (rules.match && !rules.match.test(trimmed))
        throw new ValidationError(`Pole "${field}" ma nieprawidłowy format`);
    }

    if (rules.type === 'number') {
      const num = parseFloat(val);
      if (isNaN(num)) throw new ValidationError(`Pole "${field}" musi być liczbą`);
      if (rules.min !== undefined && num < rules.min)
        throw new ValidationError(`Pole "${field}" musi być co najmniej ${rules.min}`);
      if (rules.max !== undefined && num > rules.max)
        throw new ValidationError(`Pole "${field}" musi być co najwyżej ${rules.max}`);
    }

    if (rules.type === 'boolean') {
      if (typeof val !== 'boolean') throw new ValidationError(`Pole "${field}" musi być true/false`);
    }

    if (rules.enum && !rules.enum.includes(val)) {
      throw new ValidationError(`Pole "${field}" musi być jednym z: ${rules.enum.join(', ')}`);
    }
  }
}

// Middleware factory
export function validateBody(schema) {
  return (req, res, next) => {
    try {
      validate(req.body, schema);
      next();
    } catch (e) {
      if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
      next(e);
    }
  };
}
