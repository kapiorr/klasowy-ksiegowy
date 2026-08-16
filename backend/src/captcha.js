import crypto from 'crypto';
import sharp from 'sharp';

const SECRET = () => process.env.JWT_SECRET || 'captcha-secret';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minut

function generateTask() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  if (op === '+') { a = Math.floor(Math.random() * 10) + 1; b = Math.floor(Math.random() * 10) + 1; answer = a + b; }
  else if (op === '-') { a = Math.floor(Math.random() * 10) + 5; b = Math.floor(Math.random() * 5) + 1; answer = a - b; }
  else { a = Math.floor(Math.random() * 5) + 2; b = Math.floor(Math.random() * 5) + 2; answer = a * b; }
  const opStr = op === '*' ? 'x' : op;
  return { question: `${a} ${opStr} ${b} = ?`, answer };
}

// Podpisz token HMAC żeby nie można było sfałszować
function signToken(data) {
  const hmac = crypto.createHmac('sha256', SECRET()).update(data).digest('hex').slice(0, 16);
  return `${data}.${hmac}`;
}

function verifyToken(token) {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 0) return false;
  const data = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', SECRET()).update(data).digest('hex').slice(0, 16);
  return sig === expected ? data : false;
}

// GET /captcha/image — zwraca PNG + token w nagłówku
export async function captchaImage(req, res) {
  const { question, answer } = generateTask();
  const ts = Date.now();
  const token = signToken(`${answer}|${ts}`);

  // Renderuj SVG → PNG przez sharp
  const w = 200, h = 64;
  const noise = Array.from({ length: 4 }, () =>
    `<line x1="${Math.random()*w}" y1="${Math.random()*h}" x2="${Math.random()*w}" y2="${Math.random()*h}" stroke="#cbd5e1" stroke-width="1"/>`
  ).join('');
  const dots = Array.from({ length: 12 }, () =>
    `<circle cx="${Math.random()*w}" cy="${Math.random()*h}" r="2" fill="#cbd5e1"/>`
  ).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="white" rx="8"/>
    ${noise}${dots}
    <text x="${w/2}" y="${h/2 + 10}" font-size="26" font-weight="bold"
      fill="#1e293b" text-anchor="middle" letter-spacing="4">${question}</text>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Captcha-Token', token);
  res.setHeader('Cache-Control', 'no-store');
  res.send(png);
}

// Weryfikacja: token z obrazka + odpowiedź użytkownika
export function verifyCaptcha(token, input) {
  if (!token || !input) return false;
  const data = verifyToken(token);
  if (!data) return false;
  const [answer, tsStr] = data.split('|');
  const ts = parseInt(tsStr);
  if (isNaN(ts) || Date.now() - ts > MAX_AGE_MS) return false;
  return parseInt(input) === parseInt(answer);
}

export function requireCaptcha(req, res, next) {
  const { captcha_token, captcha_answer } = req.body;
  if (!verifyCaptcha(captcha_token, captcha_answer)) {
    return res.status(400).json({ error: 'Nieprawidłowa odpowiedź CAPTCHA — odśwież i spróbuj ponownie' });
  }
  next();
}
