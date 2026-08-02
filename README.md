# Waveguide Mode Solver

Browser-based educational full-vector finite-difference eigenmode solver for integrated photonics.

It solves the coupled transverse magnetic-field eigenproblem on a Yee grid and reconstructs all six field components. Supported cross-sections are channel, rib, slot and multilayer ridge waveguides.

## Features

- Uniform or center-graded transverse mesh with subpixel interface averaging.
- Complex diagonal anisotropy: ε = diag[(nₓ + iκ)², (nᵧ + iκ)², (n_z + iκ)²].
- Local linear material dispersion, dn/dλ, about a chosen reference wavelength.
- Complex-eigenvalue material attenuation and cubic stretched-coordinate PML boundaries.
- Wavelength sweeps with field-overlap mode tracking.
- Width, height and slot-gap sweeps with resampled field-overlap mode tracking.
- Effective and imaginary index, group index, dispersion, attenuation, confinement and effective area.
- Complex Poynting-vector normalization to 1 W modal power.
- Plotly field maps, transverse cuts, sweep plots and CSV exports.
- Matrix-free shift-invert Arnoldi with BiCGSTAB inner solves and residual rejection.
- Solver and sweeps run in a Web Worker so the interface remains responsive.

## Run locally

```bash
pnpm install
pnpm dev
```

## Validate

```bash
pnpm test
pnpm run build
```

The tests exercise subpixel convergence, the finest supported grid, every geometry, graded meshes, anisotropy, complex loss, PML, power normalization and spectral/geometrical mode tracking.

## Numerical scope

- Linear, non-magnetic dielectrics with diagonal anisotropy.
- Hard-wall and PML outer boundaries are available. Radiation loss requires mesh, padding, PML-thickness and PML-strength convergence checks.
- The PML is intended for open-boundary mode studies; a nonzero imaginary effective index alone does not establish that a physical mode is leaky.
- dn/dλ is a local linear model. Use a sufficiently narrow sweep and verify the material data range.
- Group index and dispersion are numerical finite differences and require wavelength-step convergence.

## Reference

A. B. Fallahkhair, K. S. Li, and T. E. Murphy, “Vector Finite Difference Modesolver for Anisotropic Dielectric Waveguides,” *Journal of Lightwave Technology* 26(11), 1423–1431 (2008). [doi:10.1109/JLT.2008.923643](https://doi.org/10.1109/JLT.2008.923643)

## License

MIT
