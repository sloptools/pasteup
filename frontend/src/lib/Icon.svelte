<script lang="ts" module>
  // 11×11 pixel grid, from design/icons.md; tool icons from the Quiet Pixel GIMP theme.
  const paths = {
    eye: 'M3 3h5v1H3z M2 4h1v1H2z M8 4h1v1H8z M1 5h1v1H1z M9 5h1v1H9z M2 6h1v1H2z M8 6h1v1H8z M3 7h5v1H3z M4 4h3v3H4z M5 5h1v1H5z',
    x: 'M2 2h1v1H2z M3 3h1v1H3z M4 4h1v1H4z M5 5h1v1H5z M6 6h1v1H6z M7 7h1v1H7z M8 8h1v1H8z M8 2h1v1H8z M7 3h1v1H7z M6 4h1v1H6z M4 6h1v1H4z M3 7h1v1H3z M2 8h1v1H2z',
    panel: 'M1 2h9v7H1z M2 3h4v5H2z M7 3h2v5H7z',
    export: 'M5 1h1v1h1v1h1v1H6v4H5V4H3V3h1V2h1z M1 7h1v2h7V7h1v3H1z',
    move: 'M5 1h1v1H5z M4 2h3v1H4z M5 3h1v1H5z M2 4h1v1H2z M5 4h1v1H5z M8 4h1v1H8z M1 5h9v1H1z M2 6h1v1H2z M5 6h1v1H5z M8 6h1v1H8z M5 7h1v1H5z M4 8h3v1H4z M5 9h1v1H5z',
    island: 'M6 1h1v1H6z M6 2h1v1H6z M4 3h2v1H4z M7 3h2v1H7z M6 4h1v1H6z M6 5h1v1H6z M4 6h1v1H4z M3 7h1v1H3z M2 8h1v1H2z M1 9h1v1H1z',
    brush: 'M7 1h1v1H7z M6 2h1v1H6z M8 2h1v1H8z M5 3h1v1H5z M9 3h1v1H9z M4 4h1v1H4z M8 4h1v1H8z M3 5h1v1H3z M7 5h1v1H7z M2 6h1v1H2z M6 6h1v1H6z M1 7h1v1H1z M5 7h1v1H5z M1 8h1v1H1z M4 8h1v1H4z M1 9h3v1H1z',
    layer: 'M2 1h5v1h1v1h1v7H2z M3 2h3v2h2v5H3z',
    adjust: 'M5 2h1v1H5z M4 3h2v1H4z M4 4h3v1H4z M2 5h1v1H2z M4 5h4v1H4z M1 6h2v1H1z M4 6h5v1H4z M1 7h9v1H1z M1 9h1v1H1z M5 9h1v1H5z M9 9h1v1H9z',
    duplicate: 'M4 1h6v1H4z M4 2h1v1H4z M9 2h1v1H9z M4 3h1v1H4z M9 3h1v1H9z M1 4h6v1H1z M9 4h1v1H9z M1 5h1v1H1z M6 5h1v1H6z M9 5h1v1H9z M1 6h1v1H1z M6 6h4v1H6z M1 7h1v1H1z M6 7h1v1H6z M1 8h1v1H1z M6 8h1v1H6z M1 9h6v1H1z',
    merge: 'M5 1h1v1H5z M5 2h1v1H5z M5 3h1v1H5z M2 4h1v1H2z M5 4h1v1H5z M8 4h1v1H8z M3 5h1v1H3z M5 5h1v1H5z M7 5h1v1H7z M4 6h3v1H4z M5 7h1v1H5z M1 9h9v1H1z',
    trash: 'M4 1h3v1H4z M1 2h9v1H1z M2 3h1v1H2z M8 3h1v1H8z M2 4h1v1H2z M4 4h1v1H4z M6 4h1v1H6z M8 4h1v1H8z M2 5h1v1H2z M4 5h1v1H4z M6 5h1v1H6z M8 5h1v1H8z M2 6h1v1H2z M4 6h1v1H4z M6 6h1v1H6z M8 6h1v1H8z M2 7h1v1H2z M4 7h1v1H4z M6 7h1v1H6z M8 7h1v1H8z M2 8h1v1H2z M8 8h1v1H8z M3 9h5v1H3z',
    select: 'M1 1h3v1H1z M5 1h1v1H5z M7 1h3v1H7z M1 2h1v1H1z M9 2h1v1H9z M1 3h1v1H1z M9 3h1v1H9z M1 5h1v1H1z M9 5h1v1H9z M1 7h1v1H1z M9 7h1v1H9z M1 8h1v1H1z M9 8h1v1H9z M1 9h3v1H1z M5 9h1v1H5z M7 9h3v1H7z',
    lasso: 'M3 1h5v1H3z M2 2h1v1H2z M8 2h1v1H8z M1 3h1v1H1z M9 3h1v1H9z M1 4h1v1H1z M9 4h1v1H9z M2 5h1v1H2z M8 5h1v1H8z M3 6h2v1H3z M6 6h2v1H6z M5 7h1v1H5z M4 8h1v1H4z M4 9h1v1H4z M5 10h2v1H5z',
    rotate: 'M3 1h4v1H3z M2 2h1v1H2z M7 2h1v1H7z M1 3h1v1H1z M8 3h1v1H8z M1 4h1v1H1z M7 4h3v1H7z M1 5h1v1H1z M8 5h1v1H8z M1 6h1v1H1z M2 7h1v1H2z M7 7h1v1H7z M3 8h4v1H3z',
    flip: 'M5 1h1v1H5z M1 2h1v1H1z M9 2h1v1H9z M1 3h2v1H1z M5 3h1v1H5z M8 3h2v1H8z M1 4h3v1H1z M7 4h1v1H7z M9 4h1v1H9z M1 5h4v1H1z M6 5h1v1H6z M9 5h1v1H9z M1 6h3v1H1z M7 6h1v1H7z M9 6h1v1H9z M1 7h2v1H1z M5 7h1v1H5z M8 7h2v1H8z M1 8h1v1H1z M9 8h1v1H9z M5 9h1v1H5z',
    transform: 'M1 1h3v1H1z M7 1h3v1H7z M1 2h1v1H1z M3 2h5v1H3z M9 2h1v1H9z M1 3h3v1H1z M7 3h3v1H7z M2 4h1v1H2z M8 4h1v1H8z M2 5h1v1H2z M5 5h1v1H5z M8 5h1v1H8z M2 6h1v1H2z M8 6h1v1H8z M1 7h3v1H1z M7 7h3v1H7z M1 8h1v1H1z M3 8h5v1H3z M9 8h1v1H9z M1 9h3v1H1z M7 9h3v1H7z',
    gradient: 'M1 1h9v1H1z M1 2h4v1H1z M6 2h1v1H6z M9 2h1v1H9z M1 3h3v1H1z M5 3h1v1H5z M9 3h1v1H9z M1 4h4v1H1z M6 4h1v1H6z M9 4h1v1H9z M1 5h3v1H1z M5 5h1v1H5z M9 5h1v1H9z M1 6h4v1H1z M6 6h1v1H6z M9 6h1v1H9z M1 7h3v1H1z M5 7h1v1H5z M9 7h1v1H9z M1 8h4v1H1z M6 8h1v1H6z M9 8h1v1H9z M1 9h9v1H1z',
    fill: 'M4 1h1v1H4z M3 2h1v1H3z M5 2h1v1H5z M2 3h1v1H2z M6 3h1v1H6z M1 4h7v1H1z M2 5h5v1H2z M8 5h1v1H8z M3 6h3v1H3z M8 6h1v1H8z M4 7h1v1H4z M7 7h3v1H7z M7 8h3v1H7z',
    rect: 'M1 2h9v7H1z M2 3h7v5H2z',
    'rect filled': 'M1 2h9v7H1z',
    ellipse: 'M4 1h3v1H4z M2 2h2v1H2z M7 2h2v1H7z M1 3h1v1H1z M9 3h1v1H9z M1 4h1v3H1z M9 4h1v3H9z M1 7h1v1H1z M9 7h1v1H9z M2 8h2v1H2z M7 8h2v1H7z M4 9h3v1H4z',
    'ellipse filled': 'M4 1h3v1H4z M2 2h7v1H2z M1 3h9v5H1z M2 8h7v1H2z M4 9h3v1H4z',
    linear: 'M1 1h2v9H1z M4 1h2v9H4z M7 1h1v9H7z M9 1h1v9H9z',
    radial: 'M4 1h3v1H4z M2 2h2v1H2z M7 2h2v1H7z M1 3h1v1H1z M9 3h1v1H9z M1 4h1v3H1z M9 4h1v3H9z M1 7h1v1H1z M9 7h1v1H9z M2 8h2v1H2z M7 8h2v1H7z M4 9h3v1H4z M5 5h1v1H5z',
    check: 'M8 3h1v1H8z M7 4h1v1H7z M6 5h1v1H6z M5 6h1v1H5z M4 7h1v1H4z M3 6h1v1H3z M2 5h1v1H2z',
    grunge: 'M2 1h1v1H2z M6 1h2v1H6z M4 3h1v1H4z M8 3h1v2H8z M1 5h2v1H1z M5 5h1v1H5z M3 7h1v1H3z M6 7h2v1H6z M1 9h1v1H1z M4 9h1v1H4z M9 8h1v1H9z',
    invert: 'M1 1h9v9H1z M5 2h4v7H5z',
    link: 'M2 1h3v1H2z M1 2h1v3H1z M5 2h1v1H5z M2 5h1v1H2z M4 4h3v1H4z M5 6h1v1H5z M8 6h1v1H8z M6 8h1v1H6z M9 6h1v3H9z M6 9h3v1H6z',
    blur: 'M4 2h3v1H4z M2 4h1v3H2z M8 4h1v3H8z M4 8h3v1H4z M3 3h1v1H3z M7 3h1v1H7z M3 7h1v1H3z M7 7h1v1H7z M5 5h1v1H5z',
    line: 'M8 2h1v1H8z M7 3h1v1H7z M6 4h1v1H6z M5 5h1v1H5z M4 6h1v1H4z M3 7h1v1H3z M2 8h1v1H2z',
    picker: 'M8 1h2v1H8z M7 2h3v1H7z M5 3h1v1H5z M7 3h2v1H7z M6 4h1v1H6z M5 5h1v1H5z M7 5h1v1H7z M4 6h1v1H4z M6 6h1v1H6z M3 7h1v1H3z M5 7h1v1H5z M2 8h1v1H2z M4 8h1v1H4z M1 9h3v1H1z',
    eraser: 'M2 2h7v1H2z M2 3h1v1H2z M8 3h1v1H8z M2 4h1v1H2z M8 4h1v1H8z M2 5h7v1H2z M2 6h7v1H2z M2 7h7v1H2z M1 9h9v1H1z',
  } as const
  export type IconName = keyof typeof paths
  // For icons drawn outside Svelte, such as in the docs.
  export const iconPaths: Record<string, string> = paths
</script>

<script lang="ts">
  let { name, size = 16.5 }: { name: IconName; size?: number } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true">
  <path d={paths[name]} fill="currentColor" fill-rule="evenodd" />
</svg>

<style>
  svg {
    flex: none;
    display: block;
  }
</style>
