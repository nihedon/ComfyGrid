<script lang="ts">
  let {
    size = 128,
    animated = false,
    rotating = false,
    muted = false,
  }: { size?: number; animated?: boolean; rotating?: boolean; muted?: boolean } = $props();

  const tiles = [
    {
      column: 1,
      row: 1,
      width: 2,
      height: 2,
      color: 'oklch(62% 0.135 247)',
      lowerColor: 'oklch(53% 0.095 247)',
    },
    {
      column: 3,
      row: 1,
      width: 1,
      height: 2,
      color: 'oklch(78% 0.12 216)',
      lowerColor: 'oklch(65% 0.085 216)',
    },
    {
      column: 1,
      row: 3,
      width: 2,
      height: 1,
      color: 'oklch(72% 0.12 169)',
      lowerColor: 'oklch(61% 0.085 169)',
    },
    {
      column: 3,
      row: 3,
      width: 1,
      height: 1,
      color: 'oklch(75% 0.235 30)',
      lowerColor: 'oklch(65% 0.185 30)',
    },
  ];
</script>

<div
  class="app-logo"
  class:animated
  class:rotating={animated && rotating}
  class:muted
  style:--logo-size="{size}px"
  aria-hidden="true"
>
  {#each ['lower', 'upper'] as layer (layer)}
    <div class="logo-layer {layer}">
      {#each tiles as tile, index (index)}
        <span
          class="logo-tile"
          style:--tile-color={layer === 'lower' ? tile.lowerColor : tile.color}
          style:--tile-x={tile.column - 1 + tile.width / 2 - 1.5}
          style:--tile-y={tile.row - 1 + tile.height / 2 - 1.5}
          style:grid-column="{tile.column} / span {tile.width}"
          style:grid-row="{tile.row} / span {tile.height}"
          style:animation-delay="{index * 200}ms"
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
    --piece-lift: calc(var(--logo-size) * 0.035);

    &.upper {
      top: 40%;
      --piece-lift: calc(var(--logo-size) * -0.035);
    }

    &.lower {
      filter: blur(6px);
      opacity: 60%;
    }
  }

  .logo-tile {
    min-width: 0;
    min-height: 0;
    border-radius: calc(var(--logo-size) * 0.02734375);
    background: var(--tile-color);
  }

  .animated .logo-tile {
    animation:
      tile-assemble 5s cubic-bezier(0.4, 0, 0.2, 1) infinite both,
      tile-lift 5s cubic-bezier(0.4, 0, 0.2, 1) infinite both;
  }

  .rotating .logo-layer {
    animation: layer-turn 4.8s cubic-bezier(0.4, 0, 0.2, 1) infinite both;
  }

  .rotating .logo-tile {
    animation: none;
  }

  .muted .logo-layer {
    animation: none;
  }

  .muted .logo-tile {
    animation: none;
    opacity: 0.4;
  }

  @keyframes tile-lift {
    0%,
    4%,
    59%,
    100% {
      translate: 0 0;
    }
    13%,
    50% {
      /* Undo the plane projection so each pair separates vertically on screen. */
      translate: calc(var(--piece-lift) * sin(-45deg) / 0.6)
        calc(var(--piece-lift) * cos(-45deg) / 0.6);
    }
  }

  @keyframes tile-assemble {
    0%,
    27%,
    82%,
    100% {
      transform: translate(0, 0);
    }
    36%,
    73% {
      transform: translate(
        calc(var(--logo-size) * 0.1 * var(--tile-x)),
        calc(var(--logo-size) * 0.1 * var(--tile-y))
      );
    }
  }

  @keyframes layer-turn {
    0%,
    12.5% {
      transform: translate(-50%, -50%) scaleY(0.6) rotate(-45deg);
    }
    25%,
    37.5% {
      transform: translate(-50%, -50%) scaleY(0.6) rotate(45deg);
    }
    50%,
    62.5% {
      transform: translate(-50%, -50%) scaleY(0.6) rotate(135deg);
    }
    75%,
    87.5% {
      transform: translate(-50%, -50%) scaleY(0.6) rotate(225deg);
    }
    100% {
      transform: translate(-50%, -50%) scaleY(0.6) rotate(315deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .animated .logo-tile,
    .animated .logo-layer {
      animation: none;
    }
  }
</style>
