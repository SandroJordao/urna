<?php

// Em produção (XAMPP/Apache) as páginas ficam em public/, geradas por `npm run build`.
if (is_file(__DIR__ . '/public/index.html')) {
    header('Location: public/', true, 302);
    exit;
}

http_response_code(503);
header('Content-Type: text/plain; charset=utf-8');
echo "Front-end não compilado. Rode `npm install && npm run build`, ou `npm run dev` para desenvolvimento.\n";
