# Waveguide Mode Solver

Browser-based educational full-vector finite-difference eigenmode solver for integrated photonics.

It solves the coupled transverse magnetic-field eigenproblem on a Yee grid and reconstructs all six field components. Supported cross-sections are channel, rib, slot and multilayer ridge waveguides.

## Features

- Uniform or center-graded transverse mesh.
- Real diagonal anisotropy: ε = diag(nₓ², nᵧ², n_z²).
- Local linear material dispersion, dn/dλ, about a chosen reference wavelength.
- First-order material absorption from the extinction coefficient κ.
- Wavelength sweeps with field-overlap mode tracking.
- Effective index, group index, dispersion, absorption, confinement and effective area.
- Plotly field maps, transverse cuts, sweep plots and CSV exports.
- Grid-aware Arnoldi basis with residual rejection for unreliable field profiles.

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

The tests benchmark the uniform isotropic channel against WGMODES and exercise every geometry, graded meshes, anisotropy, absorption and spectral mode tracking.

## Numerical scope

- Linear, non-magnetic dielectrics with diagonal anisotropy.
- Hard outer boundaries; padding and mesh convergence remain the user's responsibility.
- κ is evaluated with a first-order field-energy perturbation. It does not include radiation leakage and is not a complex-eigenvalue solution.
- dn/dλ is a local linear model. Use a sufficiently narrow sweep and verify the material data range.
- Group index and dispersion are numerical finite differences and require wavelength-step convergence.

## Reference

A. B. Fallahkhair, K. S. Li, and T. E. Murphy, “Vector Finite Difference Modesolver for Anisotropic Dielectric Waveguides,” *Journal of Lightwave Technology* 26(11), 1423–1431 (2008). [doi:10.1109/JLT.2008.923643](https://doi.org/10.1109/JLT.2008.923643)

## License

MIT
