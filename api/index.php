<?php

declare(strict_types=1);

use Urna\Auth;
use Urna\BallotService;
use Urna\ElectionService;
use Urna\Http\HttpException;
use Urna\Http\Request;
use Urna\Http\Router;
use Urna\PhotoStorage;
use Urna\Seeder;
use Urna\Storage\JsonStore;

require __DIR__ . '/src/bootstrap.php';

$config = require __DIR__ . '/config.php';

date_default_timezone_set($config['timezone']);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

Seeder::seedIfEmpty($config['storage_dir'], $config['seed_dir']);

$store = new JsonStore($config['storage_dir']);
$photos = new PhotoStorage($config['uploads_dir'], $config['photo']);
$elections = new ElectionService($store, $photos);
$ballots = new BallotService($store);
$auth = new Auth($config['admin_password_hash']);
$router = new Router();

$ok = static fn (mixed $data = null, int $status = 200): array => [$status, $data];

// Autenticação ---------------------------------------------------------------

$router->add('GET', '/auth', static fn () => $ok(['admin' => $auth->isAdmin()]));

$router->add('POST', '/auth/login', static function (Request $r) use ($auth, $ok) {
    $auth->login((string) ($r->json()['password'] ?? ''));
    return $ok(['admin' => true]);
});

$router->add('POST', '/auth/logout', static function () use ($auth, $ok) {
    $auth->logout();
    return $ok(['admin' => false]);
});

// Eleições -------------------------------------------------------------------

$router->add('GET', '/elections', static fn () => $ok($elections->summaries()));

$router->add('POST', '/elections', static function (Request $r) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    return $ok(ElectionService::view($elections->create($r->json())), 201);
});

$router->add('GET', '/elections/{slug}', static fn (Request $r, string $slug)
    => $ok(ElectionService::view($elections->find($slug))));

$router->add('PATCH', '/elections/{slug}', static function (Request $r, string $slug) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    $input = $r->json();
    $election = isset($input['status'])
        ? $elections->setStatus($slug, (string) $input['status'])
        : $elections->update($slug, $input);

    return $ok(ElectionService::view($election));
});

$router->add('DELETE', '/elections/{slug}', static function (Request $r, string $slug) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    $elections->delete($slug);
    return $ok(null, 204);
});

$router->add('POST', '/elections/{slug}/reset', static function (Request $r, string $slug) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    return $ok(ElectionService::view($elections->reset($slug)));
});

// Candidatos -----------------------------------------------------------------

$router->add('POST', '/elections/{slug}/candidates', static function (Request $r, string $slug) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    return $ok($elections->addCandidate($slug, $r->json()), 201);
});

$router->add('PATCH', '/elections/{slug}/candidates/{id}', static function (Request $r, string $slug, string $id) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    return $ok($elections->updateCandidate($slug, $id, $r->json()));
});

$router->add('DELETE', '/elections/{slug}/candidates/{id}', static function (Request $r, string $slug, string $id) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    $elections->deleteCandidate($slug, $id);
    return $ok(null, 204);
});

$router->add('POST', '/elections/{slug}/candidates/{id}/photo', static function (Request $r, string $slug, string $id) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    $target = (string) ($r->query['target'] ?? 'candidate');
    return $ok($elections->setPhoto($slug, $id, $target, $r->files['photo'] ?? null));
});

$router->add('DELETE', '/elections/{slug}/candidates/{id}/photo', static function (Request $r, string $slug, string $id) use ($auth, $elections, $ok) {
    $auth->requireAdmin();
    $target = (string) ($r->query['target'] ?? 'candidate');
    return $ok($elections->setPhoto($slug, $id, $target, null, remove: true));
});

// Votação e apuração ---------------------------------------------------------

$router->add('POST', '/elections/{slug}/ballots', static function (Request $r, string $slug) use ($elections, $ballots, $ok) {
    $elections->find($slug);
    $ballots->cast($slug, $r->json()['choices'] ?? null);
    return $ok(['recorded' => true], 201);
});

$router->add('GET', '/elections/{slug}/results', static function (Request $r, string $slug) use ($auth, $elections, $ok) {
    $election = $elections->find($slug);
    if ($election['status'] !== ElectionService::CLOSED && !$auth->isAdmin()) {
        throw new HttpException(403, 'Os resultados ficam disponíveis após o encerramento da votação.');
    }
    return $ok(BallotService::results($election));
});

// Despacho -------------------------------------------------------------------

try {
    $request = Request::fromGlobals();

    // Toda requisição que altera dados precisa deste cabeçalho. Navegadores não
    // o enviam em formulários de outros sites sem um preflight CORS, o que
    // bloqueia CSRF mesmo se o cookie SameSite não for respeitado.
    if ($request->method !== 'GET' && $request->header('x-requested-with') !== 'urna') {
        throw new HttpException(403, 'Requisição não permitida.');
    }

    $auth->start();
    [$status, $data] = $router->dispatch($request);
} catch (HttpException $e) {
    $status = $e->status;
    $data = ['error' => $e->getMessage()] + ($e->fields !== [] ? ['fields' => $e->fields] : []);
} catch (Throwable $e) {
    error_log((string) $e);
    $status = 500;
    $data = ['error' => 'Erro interno no servidor.'];
}

http_response_code($status);
if ($status !== 204) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
