use crate::CoreOperator;
use faer::{c64, linalg::solvers::Eigen, Mat};

#[derive(Debug)]
pub struct EigenPair {
    pub eigenvalue: f64,
    pub eigenvalue_imaginary: f64,
    pub residual: f64,
    pub vector: Vec<f64>,
    pub vector_imaginary: Vec<f64>,
}

pub fn solve_shift_invert_arnoldi(
    operator: &mut CoreOperator,
    shift: f64,
    arnoldi_dimension: usize,
    requested_pairs: usize,
    initial_vector: &[f64],
) -> Result<Vec<EigenPair>, u32> {
    let vector_size = operator.vector_size();
    if vector_size == 0
        || initial_vector.len() != vector_size
        || arnoldi_dimension == 0
        || requested_pairs == 0
        || !shift.is_finite()
    {
        return Err(40);
    }
    let mut vector = initial_vector.to_vec();
    let initial_norm = norm(&vector);
    if !initial_norm.is_finite() || initial_norm < 1e-15 {
        return Err(40);
    }
    scale(&mut vector, 1.0 / initial_norm);
    let maximum_dimension = arnoldi_dimension.min(vector_size.saturating_sub(1).max(1));
    let mut basis: Vec<Vec<f64>> = Vec::with_capacity(maximum_dimension);
    let mut hessenberg = vec![vec![0.0; maximum_dimension]; maximum_dimension + 1];

    for column in 0..maximum_dimension {
        basis.push(vector);
        let mut product = operator.solve_shifted(shift, &basis[column])?;
        for row in 0..=column {
            let projection = dot(&basis[row], &product);
            hessenberg[row][column] += projection;
            add_scaled(&mut product, &basis[row], -projection);
        }
        for row in 0..=column {
            let correction = dot(&basis[row], &product);
            hessenberg[row][column] += correction;
            add_scaled(&mut product, &basis[row], -correction);
        }
        let next_norm = norm(&product);
        hessenberg[column + 1][column] = next_norm;
        if next_norm < 1e-12 || column + 1 == maximum_dimension {
            break;
        }
        scale(&mut product, 1.0 / next_norm);
        vector = product;
    }

    let dimension = basis.len();
    let reduced = Mat::<f64>::from_fn(dimension, dimension, |row, column| hessenberg[row][column]);
    let decomposition = Eigen::<f64>::new_from_real(reduced.as_ref()).map_err(|_| 41_u32)?;
    let eigenvalues = decomposition.S().column_vector();
    let eigenvectors = decomposition.U();
    let mut candidates = Vec::new();

    for column in 0..dimension {
        let inverse = eigenvalues[column];
        if !operator.is_complex() && inverse.im.abs() > 1e-7 {
            continue;
        }
        if operator.is_complex() && inverse.im < -1e-10 {
            continue;
        }
        let mut ritz = vec![c64::new(0.0, 0.0); vector_size];
        for basis_index in 0..dimension {
            let weight = eigenvectors[(basis_index, column)];
            for index in 0..vector_size {
                ritz[index] += weight * basis[basis_index][index];
            }
        }
        if !operator.is_complex() {
            let real: Vec<f64> = ritz.into_iter().map(|value| value.re).collect();
            if let Some(candidate) = candidate(operator, shift, inverse, real, Vec::new())? {
                candidates.push(candidate);
            }
            continue;
        }

        let physical_size = operator.physical_size();
        let mut first_real = vec![0.0; physical_size];
        let mut first_imaginary = vec![0.0; physical_size];
        let mut second_real = vec![0.0; physical_size];
        let mut second_imaginary = vec![0.0; physical_size];
        for index in 0..physical_size {
            let first = ritz[index];
            let second = ritz[physical_size + index];
            first_real[index] = first.re - second.im;
            first_imaginary[index] = first.im + second.re;
            second_real[index] = first.re + second.im;
            second_imaginary[index] = first.im - second.re;
        }
        let mut alternatives = Vec::new();
        for inverse_value in [inverse, c64::new(inverse.re, -inverse.im)] {
            if let Some(value) = candidate(operator, shift, inverse_value, first_real.clone(), first_imaginary.clone())? {
                alternatives.push(value);
            }
            if let Some(value) = candidate(operator, shift, inverse_value, second_real.clone(), second_imaginary.clone())? {
                alternatives.push(value);
            }
        }
        alternatives.sort_by(|first, second| first.residual.total_cmp(&second.residual));
        if let Some(best) = alternatives.into_iter().next() {
            candidates.push(best);
        }
    }
    candidates.sort_by(|first, second| second.eigenvalue.total_cmp(&first.eigenvalue));
    candidates.truncate(requested_pairs);
    Ok(candidates)
}

fn candidate(
    operator: &CoreOperator,
    shift: f64,
    inverse: c64,
    mut vector: Vec<f64>,
    mut vector_imaginary: Vec<f64>,
) -> Result<Option<EigenPair>, u32> {
    let inverse_magnitude_squared = inverse.re * inverse.re + inverse.im * inverse.im;
    if inverse_magnitude_squared < 1e-24 {
        return Ok(None);
    }
    let eigenvalue = shift + inverse.re / inverse_magnitude_squared;
    let eigenvalue_imaginary = -inverse.im / inverse_magnitude_squared;
    if !eigenvalue.is_finite() || eigenvalue <= 0.0 {
        return Ok(None);
    }
    let vector_norm = (dot(&vector, &vector) + dot(&vector_imaginary, &vector_imaginary)).sqrt();
    if !vector_norm.is_finite() || vector_norm < 1e-12 {
        return Ok(None);
    }
    scale(&mut vector, 1.0 / vector_norm);
    scale(&mut vector_imaginary, 1.0 / vector_norm);
    let mut residual_input = vector.clone();
    if operator.is_complex() {
        residual_input.extend(&vector_imaginary);
    }
    let mut residual = operator.apply(&residual_input)?;
    if operator.is_complex() {
        let size = operator.physical_size();
        for index in 0..size {
            residual[index] -= eigenvalue * vector[index] - eigenvalue_imaginary * vector_imaginary[index];
            residual[size + index] -= eigenvalue_imaginary * vector[index] + eigenvalue * vector_imaginary[index];
        }
    } else {
        add_scaled(&mut residual, &vector, -eigenvalue);
    }
    let residual = norm(&residual) / eigenvalue.hypot(eigenvalue_imaginary).max(1.0);
    Ok(Some(EigenPair { eigenvalue, eigenvalue_imaginary, residual, vector, vector_imaginary }))
}

fn dot(first: &[f64], second: &[f64]) -> f64 {
    first.iter().zip(second).map(|(a, b)| a * b).sum()
}

fn norm(values: &[f64]) -> f64 {
    dot(values, values).sqrt()
}

fn add_scaled(target: &mut [f64], source: &[f64], factor: f64) {
    for (value, addend) in target.iter_mut().zip(source) {
        *value += factor * addend;
    }
}

fn scale(values: &mut [f64], factor: f64) {
    for value in values {
        *value *= factor;
    }
}
