<script lang="ts">
  let {
    size = 128,
    animated = false,
    muted = false,
  }: { size?: number; animated?: boolean; muted?: boolean } = $props();

  const tiles = [
    {
      column: 1,
      row: 1,
      width: 2,
      height: 2,
      color: 'oklch(59.75% 0.1778 264.02)',
      lowerColor: 'oklch(69.75% 0.1278 264.02)',
    },
    {
      column: 3,
      row: 1,
      width: 1,
      height: 2,
      color: 'oklch(68.18% 0.1716 14.56)',
      lowerColor: 'oklch(78.18% 0.1216 14.56)',
    },
    {
      column: 1,
      row: 3,
      width: 2,
      height: 1,
      color: 'oklch(83.38% 0.1372 81.85)',
      lowerColor: 'oklch(93.38% 0.0872 81.85)',
    },
    {
      column: 3,
      row: 3,
      width: 1,
      height: 1,
      color: 'oklch(71.22% 0.1187 180.78)',
      lowerColor: 'oklch(81.22% 0.0687 180.78)',
    },
  ];
</script>

<div class="app-logo" class:animated class:muted style:--logo-size="{size}px" aria-hidden="true">
  {#each ['lower', 'upper'] as layer (layer)}
    <div class="logo-layer {layer}">
      {#each tiles as tile, index (index)}
        <span
          class="logo-tile"
          style:--tile-color={layer === 'lower' ? tile.lowerColor : tile.color}
          style:grid-column="{tile.column} / span {tile.width}"
          style:grid-row="{tile.row} / span {tile.height}"
          style:animation-delay="{index * 320 + (layer === 'lower' ? 160 : 0)}ms"
        ></span>
      {/each}
    </div>
  {/each}
</div>

<style lang="scss">
  .app-logo {
    position: relative;
    flex: none;
    width: var(--logo-size);
    height: var(--logo-size);
  }

  /* Project two square grids into diamonds using only 2D transforms. */
  .logo-layer {
    position: absolute;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: calc(var(--logo-size) / 32);
    width: 67.1875%;
    height: 67.1875%;
    left: 50%;
    top: 60%;
    transform: translate(-50%, -50%) scaleY(0.6) rotate(-45deg);

    &.lower {
      opacity: 0.6;
    }

    &.upper {
      top: 40%;
    }
  }

  .logo-tile {
    min-width: 0;
    min-height: 0;
    border-radius: calc(var(--logo-size) * 0.02734375);
    background: var(--tile-color);
  }

  .animated .logo-tile {
    animation: tile-wave 2.8s ease-in-out infinite both;
  }

  .muted .logo-tile {
    animation: none;
    opacity: 0.4;
  }

  @keyframes tile-wave {
    0%,
    65%,
    100% {
      transform: translate(0, 0);
    }
    30% {
      transform: translate(calc(var(--logo-size) * 0.046875), calc(var(--logo-size) * -0.046875));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .animated .logo-tile {
      animation: none;
    }
  }
</style>
