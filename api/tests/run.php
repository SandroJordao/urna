<?php

declare(strict_types=1);

/**
 * Testes da API sem dependências: `php api/tests/run.php`.
 */

use Urna\BallotService;
use Urna\ElectionService;
use Urna\Http\HttpException;
use Urna\PhotoStorage;
use Urna\Slug;
use Urna\Storage\JsonStore;

require dirname(__DIR__) . '/src/bootstrap.php';

$failures = 0;
$count = 0;

function test(string $name, callable $fn): void
{
    global $failures, $count;
    $count++;
    try {
        $fn();
        echo "  ✓ {$name}\n";
    } catch (Throwable $e) {
        $failures++;
        echo "  ✗ {$name}\n    {$e->getMessage()}\n";
    }
}

function same(mixed $expected, mixed $actual): void
{
    if ($expected !== $actual) {
        throw new RuntimeException('Esperado ' . var_export($expected, true) . ', obtido ' . var_export($actual, true));
    }
}

/**
 * @return array<string, string> Campos com erro.
 */
function rejects(int $status, callable $fn): array
{
    try {
        $fn();
    } catch (HttpException $e) {
        same($status, $e->status);
        return $e->fields;
    }
    throw new RuntimeException("Esperava HTTP {$status}.");
}

$dir = sys_get_temp_dir() . '/urna-tests-' . bin2hex(random_bytes(4));
$store = new JsonStore($dir . '/elections');
$elections = new ElectionService($store, new PhotoStorage($dir . '/uploads', ['max_bytes' => 1, 'width' => 1, 'height' => 1, 'quality' => 1]));
$ballots = new BallotService($store);

echo "Slug\n";

test('remove acentos e símbolos', function (): void {
    same('sindico', Slug::from('Síndico'));
    same('gremio-estudantil-2026', Slug::from('  Grêmio Estudantil 2026! '));
    same('conselho-fiscal', Slug::from('CONSELHO — FISCAL'));
});

echo "Cadastro\n";

$e = $elections->create([
    'title' => 'Eleição de Teste',
    'offices' => [
        ['name' => 'Conselheiro', 'digits' => 3],
        ['name' => 'Síndico', 'digits' => 2, 'hasVice' => true],
    ],
]);

test('cria eleição em rascunho com slug derivado do título', function () use ($e): void {
    same('eleicao-de-teste', $e['slug']);
    same('draft', $e['status']);
    same(['conselheiro', 'sindico'], array_column($e['offices'], 'id'));
});

test('rejeita slug duplicado', function () use ($elections): void {
    $fields = rejects(422, fn () => $elections->create(['title' => 'Eleição de Teste']));
    same(true, isset($fields['slug']));
});

test('valida número do candidato pela quantidade de dígitos do cargo', function () use ($elections): void {
    $fields = rejects(422, fn () => $elections->addCandidate('eleicao-de-teste', ['officeId' => 'conselheiro', 'number' => '12', 'name' => 'Ana']));
    same(['number'], array_keys($fields));
});

test('exige vice quando o cargo tem vice', function () use ($elections): void {
    $fields = rejects(422, fn () => $elections->addCandidate('eleicao-de-teste', ['officeId' => 'sindico', 'number' => '10', 'name' => 'Bia']));
    same(['viceName'], array_keys($fields));
});

$elections->addCandidate('eleicao-de-teste', ['officeId' => 'conselheiro', 'number' => '123', 'name' => 'Ana']);
$elections->addCandidate('eleicao-de-teste', ['officeId' => 'conselheiro', 'number' => '456', 'name' => 'Caio']);

test('não permite abrir com cargo sem candidatos', function () use ($elections): void {
    rejects(409, fn () => $elections->setStatus('eleicao-de-teste', 'open'));
});

test('não permite número repetido no mesmo cargo', function () use ($elections): void {
    $fields = rejects(422, fn () => $elections->addCandidate('eleicao-de-teste', ['officeId' => 'conselheiro', 'number' => '123', 'name' => 'Outra']));
    same(true, str_contains($fields['number'], 'Ana'));
});

test('não permite mudar dígitos de cargo com candidatos', function () use ($elections): void {
    rejects(422, fn () => $elections->update('eleicao-de-teste', ['offices' => [
        ['id' => 'conselheiro', 'name' => 'Conselheiro', 'digits' => 4],
        ['id' => 'sindico', 'name' => 'Síndico', 'digits' => 2, 'hasVice' => true],
    ]]));
});

$elections->addCandidate('eleicao-de-teste', ['officeId' => 'sindico', 'number' => '10', 'name' => 'Bia', 'viceName' => 'Davi']);
$elections->setStatus('eleicao-de-teste', 'open');

echo "Votação\n";

test('congela o cadastro após abrir', function () use ($elections): void {
    rejects(409, fn () => $elections->addCandidate('eleicao-de-teste', ['officeId' => 'sindico', 'number' => '20', 'name' => 'Eva', 'viceName' => 'Fábio']));
});

test('servidor decide voto nulo e branco', function (): void {
    $e = ['offices' => [['id' => 'a', 'name' => 'A', 'digits' => 2]], 'candidates' => [['officeId' => 'a', 'number' => '13']]];
    same(['a' => '13'], BallotService::ballot($e, ['a' => '13']));
    same(['a' => 'N'], BallotService::ballot($e, ['a' => '99']));
    same(['a' => 'B'], BallotService::ballot($e, ['a' => null]));
});

test('rejeita cédula incompleta, com cargo extra ou dígitos errados', function () use ($ballots): void {
    rejects(422, fn () => $ballots->cast('eleicao-de-teste', ['conselheiro' => '123']));
    rejects(422, fn () => $ballots->cast('eleicao-de-teste', ['conselheiro' => '123', 'sindico' => '10', 'x' => '1']));
    rejects(422, fn () => $ballots->cast('eleicao-de-teste', ['conselheiro' => '12', 'sindico' => '10']));
});

$ballots->cast('eleicao-de-teste', ['conselheiro' => '123', 'sindico' => '10']);
$ballots->cast('eleicao-de-teste', ['conselheiro' => '123', 'sindico' => null]);
$ballots->cast('eleicao-de-teste', ['conselheiro' => '999', 'sindico' => '10']);

test('não volta a rascunho depois de receber votos', function () use ($elections): void {
    rejects(409, fn () => $elections->setStatus('eleicao-de-teste', 'draft'));
});

$elections->setStatus('eleicao-de-teste', 'closed');

echo "Apuração\n";

test('soma votos, brancos e nulos por cargo', function () use ($elections): void {
    $r = BallotService::results($elections->find('eleicao-de-teste'));
    [$conselheiro, $sindico] = $r['offices'];

    same(3, $r['ballots']);
    same(['123' => 2, '456' => 0], array_column($conselheiro['candidates'], 'votes', 'number'));
    same([0, 1], [$conselheiro['blank'], $conselheiro['null']]);
    same([2, 1, 0], [$sindico['valid'], $sindico['blank'], $sindico['null']]);
    same(true, $r['integrity']['consistent']);
});

test('rejeita voto após o encerramento', function () use ($ballots): void {
    rejects(409, fn () => $ballots->cast('eleicao-de-teste', ['conselheiro' => '123', 'sindico' => '10']));
});

test('detecta adulteração do arquivo', function () use ($store, $elections): void {
    $store->update('eleicao-de-teste', function (array $e): array {
        $e['tally']['conselheiro']['candidates']['456'] = 50;
        return $e;
    });
    $r = BallotService::results($elections->find('eleicao-de-teste'));
    same(false, $r['integrity']['consistent']);
});

$elections->delete('eleicao-de-teste');
@rmdir($dir . '/elections');
@rmdir($dir . '/uploads');
@rmdir($dir);

echo "\n" . ($failures === 0 ? "{$count} testes passaram.\n" : "{$failures} de {$count} testes falharam.\n");
exit($failures === 0 ? 0 : 1);
