<?php

declare(strict_types=1);

namespace Urna;

use Urna\Http\HttpException;
use Urna\Storage\JsonStore;

/**
 * Recebe cédulas e faz a apuração.
 *
 * Cada eleição guarda duas coisas:
 *  - `tally`: totais por cargo, atualizados a cada voto;
 *  - `rdv` (Registro Digital do Voto): as cédulas, sem horário nem
 *    identificação, inseridas em posição aleatória para que a ordem não
 *    revele quem votou em quem.
 *
 * Na apuração os totais são recalculados a partir do RDV; se não baterem com
 * `tally`, o arquivo foi alterado por fora da API.
 */
final class BallotService
{
    public const BLANK = 'B';
    public const NULL = 'N';

    public function __construct(private readonly JsonStore $store)
    {
    }

    /**
     * @param array<string, mixed> $e
     * @return array<string, array{candidates: array<string, int>, blank: int, null: int}>
     */
    public static function emptyTally(array $e): array
    {
        $tally = [];
        foreach ($e['offices'] as $office) {
            $tally[$office['id']] = ['candidates' => [], 'blank' => 0, 'null' => 0];
        }
        foreach ($e['candidates'] as $c) {
            $tally[$c['officeId']]['candidates'][$c['number']] = 0;
        }

        return $tally;
    }

    /**
     * Converte as escolhas enviadas pela urna em uma cédula.
     *
     * O servidor decide o que é voto nulo: o cliente apenas informa o número
     * digitado (string) ou `null` para voto em branco.
     *
     * @param array<string, mixed> $e
     * @param mixed $choices
     * @return array<string, string> officeId => número | B | N
     */
    public static function ballot(array $e, mixed $choices): array
    {
        if (!is_array($choices)) {
            throw HttpException::invalid(['choices' => 'Cédula inválida.']);
        }

        $numbers = [];
        foreach ($e['candidates'] as $c) {
            $numbers[$c['officeId']][$c['number']] = true;
        }

        $ballot = [];
        foreach ($e['offices'] as $office) {
            $id = $office['id'];
            if (!array_key_exists($id, $choices)) {
                throw HttpException::invalid(["choices.{$id}" => "Falta o voto para {$office['name']}."]);
            }

            $choice = $choices[$id];
            if ($choice === null) {
                $ballot[$id] = self::BLANK;
                continue;
            }
            if (!is_string($choice) || preg_match('/^\d{' . $office['digits'] . '}$/', $choice) !== 1) {
                throw HttpException::invalid(["choices.{$id}" => "Número inválido para {$office['name']}."]);
            }

            $ballot[$id] = isset($numbers[$id][$choice]) ? $choice : self::NULL;
        }

        if (count($choices) !== count($ballot)) {
            throw HttpException::invalid(['choices' => 'A cédula contém cargos desconhecidos.']);
        }

        return $ballot;
    }

    /**
     * @param mixed $choices
     */
    public function cast(string $slug, mixed $choices): void
    {
        $this->store->update($slug, static function (array $e) use ($choices): array {
            if ($e['status'] !== ElectionService::OPEN) {
                throw HttpException::conflict('A votação não está aberta.');
            }

            $ballot = self::ballot($e, $choices);
            $e['tally'] = self::add($e['tally'] ?: self::emptyTally($e), $ballot);
            array_splice($e['rdv'], random_int(0, count($e['rdv'])), 0, [$ballot]);
            $e['ballots']++;

            return $e;
        });
    }

    /**
     * @param array<string, mixed> $tally
     * @param array<string, string> $ballot
     * @return array<string, mixed>
     */
    public static function add(array $tally, array $ballot): array
    {
        foreach ($ballot as $officeId => $choice) {
            $tally[$officeId] ??= ['candidates' => [], 'blank' => 0, 'null' => 0];
            match ($choice) {
                self::BLANK => $tally[$officeId]['blank']++,
                self::NULL => $tally[$officeId]['null']++,
                default => $tally[$officeId]['candidates'][$choice] = ($tally[$officeId]['candidates'][$choice] ?? 0) + 1,
            };
        }

        return $tally;
    }

    /**
     * Boletim de urna: totais por cargo, verificação do RDV e hash.
     *
     * @param array<string, mixed> $e
     * @return array<string, mixed>
     */
    public static function results(array $e): array
    {
        $tally = $e['tally'] ?: self::emptyTally($e);

        $recount = self::emptyTally($e);
        foreach ($e['rdv'] as $ballot) {
            $recount = self::add($recount, $ballot);
        }
        $consistent = count($e['rdv']) === $e['ballots'] && self::normalize($recount) === self::normalize($tally);

        $offices = [];
        foreach ($e['offices'] as $office) {
            $t = $tally[$office['id']] ?? ['candidates' => [], 'blank' => 0, 'null' => 0];
            $candidates = array_values(array_filter($e['candidates'], static fn (array $c): bool => $c['officeId'] === $office['id']));

            $rows = array_map(static fn (array $c): array => $c + ['votes' => (int) ($t['candidates'][$c['number']] ?? 0)], $candidates);
            usort($rows, static fn (array $a, array $b): int => [$b['votes'], $a['number']] <=> [$a['votes'], $b['number']]);

            $valid = array_sum(array_column($rows, 'votes'));
            $offices[] = [
                'office' => $office,
                'candidates' => $rows,
                'valid' => $valid,
                'blank' => $t['blank'],
                'null' => $t['null'],
                'total' => $valid + $t['blank'] + $t['null'],
            ];
        }

        $summary = [
            'slug' => $e['slug'],
            'title' => $e['title'],
            'openedAt' => $e['openedAt'],
            'closedAt' => $e['closedAt'],
            'ballots' => $e['ballots'],
            'tally' => self::normalize($tally),
        ];

        return [
            'election' => ElectionService::view($e),
            'offices' => $offices,
            'ballots' => $e['ballots'],
            'final' => $e['status'] === ElectionService::CLOSED,
            'generatedAt' => ElectionService::now(),
            'integrity' => [
                'consistent' => $consistent,
                'hash' => hash('sha256', json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)),
            ],
        ];
    }

    /**
     * Ordena chaves e remove zeros para comparar totais de forma estável.
     *
     * @param array<string, mixed> $tally
     * @return array<string, mixed>
     */
    private static function normalize(array $tally): array
    {
        ksort($tally);
        foreach ($tally as &$office) {
            $office['candidates'] = array_filter($office['candidates'], static fn (int $n): bool => $n > 0);
            ksort($office['candidates'], SORT_STRING);
        }

        return $tally;
    }
}
