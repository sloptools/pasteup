<script lang="ts" module>
  // 11×11 pixel grid, from design/icons.md.
  const paths = {
    eye: 'M3 3h5v1H3z M2 4h1v1H2z M8 4h1v1H8z M1 5h1v1H1z M9 5h1v1H9z M2 6h1v1H2z M8 6h1v1H8z M3 7h5v1H3z M4 4h3v3H4z M5 5h1v1H5z',
    x: 'M2 2h1v1H2z M3 3h1v1H3z M4 4h1v1H4z M5 5h1v1H5z M6 6h1v1H6z M7 7h1v1H7z M8 8h1v1H8z M8 2h1v1H8z M7 3h1v1H7z M6 4h1v1H6z M4 6h1v1H4z M3 7h1v1H3z M2 8h1v1H2z',
    panel: 'M1 2h9v7H1z M2 3h4v5H2z M7 3h2v5H7z',
    export: 'M5 1h1v1h1v1h1v1H6v4H5V4H3V3h1V2h1z M1 7h1v2h7V7h1v3H1z',
  } as const
  export type IconName = keyof typeof paths
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
