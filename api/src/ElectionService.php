<?php

declare(strict_types=1);

namespace Urna;

use Urna\Http\HttpException;
use Urna\Storage\JsonStore;

/**
 * Cadastro de eleições, cargos e candidatos.
 *
 * Ciclo de vida: draft (rascunho, editável) → open (votação aberta, cadastro
 * congelado) → closed (encerrada, resultados públicos).
 */
final class ElectionService
{
    public const DRAFT = 'draft';
    public const OPEN = 'open';
    public const CLOSED = 'closed';

    private const MAX_OFFICES = 8;
    private const MAX_CANDIDATES = 99;

    public function __construct(
        private readonly JsonStore $store,
        private readonly PhotoStorage $photos,
    ) {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function summaries(): array
    {
        $summaries = [];
        foreach ($this->store->keys() as $slug) {
            $election = $this->store->read($slug);
            if ($election === null) {
                continue;
            }
            $summaries[] = [
                'slug' => $election['slug'],
                'title' => $election['title'],
                'description' => $election['description'],
                'status' => $election['status'],
                'offices' => array_column($election['offices'], 'name'),
                'candidates' => count($election['candidates']),
                'ballots' => $election['ballots'],
                'updatedAt' => $election['updatedAt'],
            ];
        }

        usort($summaries, static fn (array $a, array $b): int => strcmp($b['updatedAt'], $a['updatedAt']));

        return $summaries;
    }

    /**
     * @return array<string, mixed>
     */
    public function find(string $slug): array
    {
        $election = Slug::isValid($slug) ? $this->store->read($slug) : null;
        if ($election === null) {
            throw HttpException::notFound('Eleição não encontrada.');
        }

        return $election;
    }

    /**
     * Visão pública: tudo menos a apuração e o registro de votos.
     *
     * @param array<string, mixed> $election
     * @return array<string, mixed>
     */
    public static function view(array $election): array
    {
        unset($election['tally'], $election['rdv']);

        return $election;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(array $input): array
    {
        $v = new Validator($input);
        $title = $v->string('title', 3, 80, 'o título');
        $description = $v->string('description', 0, 280, 'a descrição', '');
        $slug = Slug::from(is_string($input['slug'] ?? null) && $input['slug'] !== '' ? $input['slug'] : $title);

        if (!$v->has('title') && !Slug::isValid($slug)) {
            $v->error('slug', 'Identificador inválido.');
        } elseif (!$v->has('title') && $this->store->exists($slug)) {
            $v->error('slug', 'Já existe uma eleição com esse identificador.');
        }

        $offices = $this->validateOffices($input['offices'] ?? [['name' => 'Presidente', 'digits' => 2, 'hasVice' => true]], $v);
        $v->check();

        $now = self::now();
        $election = [
            'schema' => 1,
            'slug' => $slug,
            'title' => $title,
            'description' => $description,
            'status' => self::DRAFT,
            'createdAt' => $now,
            'updatedAt' => $now,
            'openedAt' => null,
            'closedAt' => null,
            'offices' => $offices,
            'candidates' => [],
            'ballots' => 0,
            'tally' => new \stdClass(),
            'rdv' => [],
        ];

        $this->store->create($slug, $election);

        return $election;
    }

    /**
     * Atualiza título, descrição e cargos.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function update(string $slug, array $input): array
    {
        $this->find($slug);

        return $this->store->update($slug, function (array $e) use ($input): array {
            $v = new Validator($input);
            $e['title'] = $v->string('title', 3, 80, 'o título', $e['title']);
            $e['description'] = $v->string('description', 0, 280, 'a descrição', $e['description']);

            if (array_key_exists('offices', $input)) {
                self::assertDraft($e);
                $offices = $this->validateOffices($input['offices'], $v);
                $this->assertCandidatesFit($offices, $e['candidates'], $v);
                $e['offices'] = $offices;
            }

            $v->check();
            $e['updatedAt'] = self::now();

            return $e;
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function setStatus(string $slug, string $status): array
    {
        $this->find($slug);

        return $this->store->update($slug, function (array $e) use ($status): array {
            $from = $e['status'];
            $now = self::now();

            match (true) {
                $from === self::DRAFT && $status === self::OPEN => self::assertReadyToOpen($e),
                $from === self::OPEN && $status === self::CLOSED => null,
                $from === self::OPEN && $status === self::DRAFT && $e['ballots'] === 0 => null,
                $from === self::OPEN && $status === self::DRAFT
                    => throw HttpException::conflict('A votação já recebeu votos e não pode voltar a rascunho.'),
                default => throw HttpException::conflict('Mudança de situação não permitida.'),
            };

            if ($status === self::OPEN) {
                $e['openedAt'] = $now;
                $e['ballots'] = 0;
                $e['tally'] = BallotService::emptyTally($e);
                $e['rdv'] = [];
            }
            if ($status === self::CLOSED) {
                $e['closedAt'] = $now;
            }
            if ($status === self::DRAFT) {
                $e['openedAt'] = null;
            }

            $e['status'] = $status;
            $e['updatedAt'] = $now;

            return $e;
        });
    }

    /**
     * Apaga os votos e devolve a eleição para rascunho. Pensado para
     * demonstrações; numa eleição real isso não existiria.
     *
     * @return array<string, mixed>
     */
    public function reset(string $slug): array
    {
        $this->find($slug);

        return $this->store->update($slug, static function (array $e): array {
            $e['status'] = self::DRAFT;
            $e['openedAt'] = null;
            $e['closedAt'] = null;
            $e['ballots'] = 0;
            $e['tally'] = new \stdClass();
            $e['rdv'] = [];
            $e['updatedAt'] = self::now();

            return $e;
        });
    }

    public function delete(string $slug): void
    {
        $this->find($slug);
        $this->store->delete($slug);
        $this->photos->deleteAll($slug);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed> O candidato criado.
     */
    public function addCandidate(string $slug, array $input): array
    {
        $this->find($slug);
        $id = bin2hex(random_bytes(6));

        $election = $this->store->update($slug, function (array $e) use ($input, $id): array {
            self::assertDraft($e);
            if (count($e['candidates']) >= self::MAX_CANDIDATES) {
                throw HttpException::conflict('Limite de candidatos atingido.');
            }

            $candidate = $this->validateCandidate($e, $input, null);
            $candidate = ['id' => $id] + $candidate;
            $e['candidates'][] = $candidate;
            $e['candidates'] = self::sortCandidates($e);
            $e['updatedAt'] = self::now();

            return $e;
        });

        return self::candidate($election, $id);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateCandidate(string $slug, string $id, array $input): array
    {
        $this->find($slug);
        $removedPhoto = null;

        $election = $this->store->update($slug, function (array $e) use ($input, $id, &$removedPhoto): array {
            self::assertDraft($e);
            $index = self::candidateIndex($e, $id);
            $current = $e['candidates'][$index];

            $candidate = $this->validateCandidate($e, $input, $current);
            if ($candidate['vice'] === null && $current['vice'] !== null) {
                $removedPhoto = $current['vice']['photo'];
            }

            $e['candidates'][$index] = ['id' => $id] + $candidate;
            $e['candidates'] = self::sortCandidates($e);
            $e['updatedAt'] = self::now();

            return $e;
        });

        $this->photos->delete($removedPhoto);

        return self::candidate($election, $id);
    }

    public function deleteCandidate(string $slug, string $id): void
    {
        $this->find($slug);
        $removed = null;

        $this->store->update($slug, static function (array $e) use ($id, &$removed): array {
            self::assertDraft($e);
            $index = self::candidateIndex($e, $id);
            $removed = $e['candidates'][$index];
            array_splice($e['candidates'], $index, 1);
            $e['updatedAt'] = self::now();

            return $e;
        });

        $this->photos->delete($removed['photo']);
        $this->photos->delete($removed['vice']['photo'] ?? null);
    }

    /**
     * Grava (ou remove, quando $file é null) a foto do titular ou do vice.
     *
     * @param array<string, mixed>|null $file
     * @return array<string, mixed>
     */
    public function setPhoto(string $slug, string $id, string $target, ?array $file, bool $remove = false): array
    {
        if (!in_array($target, ['candidate', 'vice'], true)) {
            throw HttpException::invalid(['target' => 'Destino da foto inválido.']);
        }

        $e = $this->find($slug);
        self::assertDraft($e);
        self::candidateIndex($e, $id);

        $path = $remove ? null : $this->photos->store($slug, $file);
        $previous = null;

        try {
            $election = $this->store->update($slug, static function (array $e) use ($id, $target, $path, &$previous): array {
                self::assertDraft($e);
                $index = self::candidateIndex($e, $id);
                $candidate = &$e['candidates'][$index];

                if ($target === 'vice') {
                    if ($candidate['vice'] === null) {
                        throw HttpException::conflict('Este candidato não tem vice.');
                    }
                    $previous = $candidate['vice']['photo'];
                    $candidate['vice']['photo'] = $path;
                } else {
                    $previous = $candidate['photo'];
                    $candidate['photo'] = $path;
                }

                unset($candidate);
                $e['updatedAt'] = self::now();

                return $e;
            });
        } catch (\Throwable $error) {
            $this->photos->delete($path);
            throw $error;
        }

        $this->photos->delete($previous);

        return self::candidate($election, $id);
    }

    public static function now(): string
    {
        return (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
    }

    /**
     * @param array<string, mixed> $e
     */
    private static function assertDraft(array $e): void
    {
        if ($e['status'] !== self::DRAFT) {
            throw HttpException::conflict('O cadastro só pode ser alterado enquanto a eleição estiver em rascunho.');
        }
    }

    /**
     * @param array<string, mixed> $e
     */
    private static function assertReadyToOpen(array $e): void
    {
        $empty = [];
        foreach ($e['offices'] as $office) {
            $has = array_filter($e['candidates'], static fn (array $c): bool => $c['officeId'] === $office['id']);
            if ($has === []) {
                $empty[] = $office['name'];
            }
        }

        if ($empty !== []) {
            throw HttpException::conflict('Cadastre ao menos um candidato para: ' . implode(', ', $empty) . '.');
        }

        $hasVice = array_column($e['offices'], 'hasVice', 'id');
        foreach ($e['candidates'] as $c) {
            if ($hasVice[$c['officeId']] && $c['vice'] === null) {
                throw HttpException::conflict("Informe o vice de {$c['name']}.");
            }
        }
    }

    /**
     * @return list<array{id: string, name: string, digits: int, hasVice: bool}>
     */
    private function validateOffices(mixed $input, Validator $v): array
    {
        if (!is_array($input) || $input === [] || !array_is_list($input)) {
            $v->error('offices', 'Informe ao menos um cargo.');
            return [];
        }
        if (count($input) > self::MAX_OFFICES) {
            $v->error('offices', 'Máximo de ' . self::MAX_OFFICES . ' cargos.');
            return [];
        }

        $offices = [];
        foreach ($input as $i => $raw) {
            $raw = is_array($raw) ? $raw : [];
            $name = trim((string) ($raw['name'] ?? ''));
            $digits = filter_var($raw['digits'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 5]]);
            $id = Slug::from(is_string($raw['id'] ?? null) && $raw['id'] !== '' ? $raw['id'] : $name);

            if (mb_strlen($name) < 2 || mb_strlen($name) > 40) {
                $v->error("offices.{$i}.name", 'O nome do cargo deve ter entre 2 e 40 caracteres.');
            } elseif (isset($offices[$id])) {
                $v->error("offices.{$i}.name", 'Cargo repetido.');
            }
            if ($digits === false) {
                $v->error("offices.{$i}.digits", 'Use de 1 a 5 dígitos.');
            }

            $offices[$id] = [
                'id' => $id,
                'name' => $name,
                'digits' => (int) $digits,
                'hasVice' => (bool) ($raw['hasVice'] ?? false),
            ];
        }

        return array_values($offices);
    }

    /**
     * @param list<array<string, mixed>> $offices
     * @param list<array<string, mixed>> $candidates
     */
    private function assertCandidatesFit(array $offices, array $candidates, Validator $v): void
    {
        $byId = array_column($offices, null, 'id');

        foreach ($candidates as $c) {
            $office = $byId[$c['officeId']] ?? null;
            if ($office === null) {
                $v->error('offices', "Não é possível remover um cargo com candidatos ({$c['name']}).");
                return;
            }
            if (strlen($c['number']) !== $office['digits']) {
                $v->error('offices', "{$office['name']}: há candidatos com número de " . strlen($c['number']) . ' dígitos.');
                return;
            }
            if (!$office['hasVice'] && $c['vice'] !== null) {
                $v->error('offices', "{$office['name']}: remova os vices dos candidatos antes de desativar a opção.");
                return;
            }
        }
    }

    /**
     * @param array<string, mixed> $e
     * @param array<string, mixed> $input
     * @param array<string, mixed>|null $current
     * @return array<string, mixed>
     */
    private function validateCandidate(array $e, array $input, ?array $current): array
    {
        $v = new Validator($input);
        $name = $v->string('name', 2, 60, 'o nome', $current['name'] ?? null);
        $party = $v->string('party', 0, 40, 'o partido', $current['party'] ?? '');
        $officeId = (string) ($input['officeId'] ?? $current['officeId'] ?? '');
        $number = (string) ($input['number'] ?? $current['number'] ?? '');

        $office = array_column($e['offices'], null, 'id')[$officeId] ?? null;
        if ($office === null) {
            $v->error('officeId', 'Selecione um cargo válido.');
        } elseif (preg_match('/^\d{' . $office['digits'] . '}$/', $number) !== 1) {
            $v->error('number', "O número deve ter exatamente {$office['digits']} dígito(s).");
        } else {
            foreach ($e['candidates'] as $other) {
                if ($other['officeId'] === $officeId && $other['number'] === $number && $other['id'] !== ($current['id'] ?? null)) {
                    $v->error('number', "O número {$number} já pertence a {$other['name']}.");
                }
            }
        }

        $vice = null;
        if ($office !== null && $office['hasVice']) {
            $viceName = $v->string('viceName', 2, 60, 'o nome do vice', $current['vice']['name'] ?? null);
            $vice = ['name' => $viceName, 'photo' => $current['vice']['photo'] ?? null];
        }

        $v->check();

        return [
            'officeId' => $officeId,
            'number' => $number,
            'name' => $name,
            'party' => $party,
            'photo' => $current['photo'] ?? null,
            'vice' => $vice,
        ];
    }

    /**
     * @param array<string, mixed> $e
     */
    private static function candidateIndex(array $e, string $id): int
    {
        foreach ($e['candidates'] as $index => $candidate) {
            if ($candidate['id'] === $id) {
                return $index;
            }
        }

        throw HttpException::notFound('Candidato não encontrado.');
    }

    /**
     * @param array<string, mixed> $e
     * @return array<string, mixed>
     */
    private static function candidate(array $e, string $id): array
    {
        return $e['candidates'][self::candidateIndex($e, $id)];
    }

    /**
     * Ordena por cargo (na ordem da cédula) e depois por número.
     *
     * @param array<string, mixed> $e
     * @return list<array<string, mixed>>
     */
    private static function sortCandidates(array $e): array
    {
        $order = array_flip(array_column($e['offices'], 'id'));
        $candidates = $e['candidates'];
        usort($candidates, static fn (array $a, array $b): int
            => [$order[$a['officeId']] ?? 99, $a['number']] <=> [$order[$b['officeId']] ?? 99, $b['number']]);

        return $candidates;
    }
}
