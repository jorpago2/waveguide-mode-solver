# Waveguide Mode Solver

Browser-based educational full-vector finite-difference eigenmode solver for isotropic dielectric waveguides.

The solver discretizes Maxwell's equations on a transverse Yee grid, solves the coupled eigenproblem for the transverse magnetic field, and reconstructs all six field components. It reports effective index, propagation constant, electric confinement, effective area, polarization fractions, and the relative eigenpair residual.

## Run locally

```bash
pnpm install
pnpm dev
```

## Validation

```bash
pnpm test
pnpm run build
```

The automated benchmark compares the fundamental effective index against the reference Yee-grid implementation from WGMODES for a silicon-nitride channel waveguide. Mesh and boundary convergence must still be checked before using a result for device design.

## Numerical scope

- Linear, isotropic, non-magnetic, lossless dielectric materials.
- Uniform transverse Yee grid with hard outer boundaries.
- Full-vector solution for `Hx` and `Hy`; the remaining field components follow from the discrete Maxwell curl relations.
- Arnoldi projection for the largest guided eigenpairs.

The current release does not model anisotropy, material loss, PML boundaries, bends, propagation discontinuities, or radiation loss.

## Reference

A. B. Fallahkhair, K. S. Li, and T. E. Murphy, “Vector Finite Difference Modesolver for Anisotropic Dielectric Waveguides,” *Journal of Lightwave Technology* 26(11), 1423–1431 (2008). [doi:10.1109/JLT.2008.923643](https://doi.org/10.1109/JLT.2008.923643)

## License

MIT
