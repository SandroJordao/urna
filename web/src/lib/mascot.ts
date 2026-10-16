/**
 * Mascote no estilo "rubber hose": uma urna com olhos de torta, braços de
 * mangueira e luvas brancas. O SVG é constante (nenhum dado externo entra
 * aqui), então pode ser montado a partir de uma string.
 */
const SVG = `
<svg viewBox="0 0 200 230" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="#1d1612" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="100" cy="222" rx="62" ry="6" fill="#1d1612" stroke="none" opacity=".18"/>
    <g class="m-bob">
      <path d="M82 166c-3 18 6 30-4 44M118 166c3 18-6 30 4 44" stroke-width="7"/>
      <ellipse cx="70" cy="213" rx="18" ry="9" fill="#1d1612"/>
      <ellipse cx="132" cy="213" rx="18" ry="9" fill="#1d1612"/>
      <ellipse cx="64" cy="209" rx="5" ry="2" fill="#fff8e7" stroke="none"/>
      <ellipse cx="126" cy="209" rx="5" ry="2" fill="#fff8e7" stroke="none"/>

      <g class="m-wave">
        <path d="M50 124c-24-2-30-24-22-46" stroke-width="7"/>
        <ellipse cx="29" cy="82" rx="11" ry="5" fill="#fff8e7" stroke-width="4"/>
        <path d="M19 74c-6-10 0-24 10-24 4 0 6 4 6 8 4-2 10 0 10 6s-6 12-14 13c-6 1-10 0-12-3z" fill="#fff8e7" stroke-width="4"/>
        <path d="M30 58v8M36 64l-4 5" stroke-width="3"/>
      </g>

      <g class="m-swing">
        <path d="M150 124c22 4 28 20 20 38" stroke-width="7"/>
        <ellipse cx="169" cy="160" rx="11" ry="5" fill="#fff8e7" stroke-width="4"/>
        <path d="M158 166c-2 10 4 18 12 18 9 0 14-8 12-16-1-6-8-8-14-7-4 1-9 2-10 5z" fill="#fff8e7" stroke-width="4"/>
        <path d="M166 172l2 8M174 170l2 8" stroke-width="3"/>
      </g>

      <g transform="rotate(-9 100 60)">
        <rect x="83" y="34" width="34" height="40" rx="3" fill="#fffdf6" stroke-width="4"/>
        <path d="M90 46h20M90 54h12" stroke-width="3"/>
        <path d="M95 62l4 5 9-11" stroke="#d8432f" stroke-width="4"/>
      </g>

      <rect x="46" y="74" width="108" height="98" rx="22" fill="#fff8e7"/>
      <path d="M60 152c20 6 60 6 80 0" stroke-width="3" opacity=".5"/>
      <rect x="38" y="64" width="124" height="22" rx="10" fill="#d8432f"/>
      <rect x="76" y="71" width="48" height="7" rx="3.5" fill="#1d1612" stroke="none"/>

      <circle cx="66" cy="132" r="8" fill="#d8432f" stroke="none" opacity=".4"/>
      <circle cx="134" cy="132" r="8" fill="#d8432f" stroke="none" opacity=".4"/>

      <g class="m-blink">
        <ellipse cx="85" cy="110" rx="10" ry="16" fill="#1d1612" stroke="none"/>
        <ellipse cx="115" cy="110" rx="10" ry="16" fill="#1d1612" stroke="none"/>
        <path d="M86 98l7-4 1 9zM116 98l7-4 1 9z" fill="#fff8e7" stroke="none"/>
      </g>

      <path d="M72 128q28 42 56 0q-28 10-56 0z" fill="#1d1612" stroke-width="4"/>
      <path d="M88 145q12 12 24 0q-12-7-24 0z" fill="#d8432f" stroke="none"/>
    </g>
  </g>
</svg>`

const template = document.createElement('template')
template.innerHTML = SVG.trim()

/** Devolve uma cópia do mascote. Com `still`, ele fica parado. */
export function mascot(className = '', still = false): SVGSVGElement {
  const svg = template.content.firstElementChild!.cloneNode(true) as SVGSVGElement
  svg.setAttribute('class', ['mascot', still ? 'still' : '', className].filter(Boolean).join(' '))
  return svg
}
