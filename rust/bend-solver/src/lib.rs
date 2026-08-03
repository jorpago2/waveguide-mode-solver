mod eigen;
mod sparse;
mod tensor;
mod vector;

use eigen::{solve_shift_invert_arnoldi, EigenPair};
use sparse::SparseOperator;
use std::{cell::RefCell, mem, slice};
use tensor::TensorOperator;
use vector::VectorOperator;

enum CoreOperator {
    Vector(VectorOperator),
    Tensor(TensorOperator),
    Sparse(SparseOperator),
}

impl CoreOperator {
    fn physical_size(&self) -> usize {
        match self {
            Self::Vector(operator) => operator.physical_size(),
            Self::Tensor(operator) => operator.physical_size(),
            Self::Sparse(operator) => operator.physical_size(),
        }
    }

    fn is_complex(&self) -> bool {
        match self {
            Self::Vector(operator) => operator.is_complex(),
            Self::Tensor(_) => false,
            Self::Sparse(operator) => operator.is_complex(),
        }
    }

    fn vector_size(&self) -> usize {
        self.physical_size() * if self.is_complex() { 2 } else { 1 }
    }

    fn apply(&self, input: &[f64]) -> Result<Vec<f64>, u32> {
        match self {
            Self::Vector(operator) => operator.apply(input),
            Self::Tensor(operator) => operator.apply(input),
            Self::Sparse(operator) => operator.apply(input),
        }
    }

    fn solve_shifted(&mut self, shift: f64, right_hand_side: &[f64]) -> Result<Vec<f64>, u32> {
        match self {
            Self::Sparse(operator) => operator.solve_shifted(shift, right_hand_side),
            Self::Vector(operator) => bicgstab(|vector| operator.apply(vector), shift, right_hand_side, 180, 1e-5),
            Self::Tensor(operator) => bicgstab(|vector| operator.apply(vector), shift, right_hand_side, 180, 1e-5),
        }
    }
}

thread_local! {
    static OPERATOR: RefCell<Option<CoreOperator>> = const { RefCell::new(None) };
    static RESULTS: RefCell<Vec<EigenPair>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn allocate_f64(length: usize) -> *mut f64 {
    let mut values = Vec::<f64>::with_capacity(length);
    let pointer = values.as_mut_ptr();
    mem::forget(values);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn deallocate_f64(pointer: *mut f64, capacity: usize) {
    if !pointer.is_null() {
        drop(Vec::from_raw_parts(pointer, 0, capacity));
    }
}

#[no_mangle]
pub extern "C" fn allocate_u32(length: usize) -> *mut u32 {
    let mut values = Vec::<u32>::with_capacity(length);
    let pointer = values.as_mut_ptr();
    mem::forget(values);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn deallocate_u32(pointer: *mut u32, capacity: usize) {
    if !pointer.is_null() {
        drop(Vec::from_raw_parts(pointer, 0, capacity));
    }
}

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub unsafe extern "C" fn configure_vector_operator(
    nx: usize,
    ny: usize,
    k0: f64,
    periodic_x: u32,
    bloch_phase_x: f64,
    periodic_y: u32,
    bloch_phase_y: f64,
    dx_cell: *const f64,
    dy_cell: *const f64,
    dx_dual: *const f64,
    dy_dual: *const f64,
    epsilon_x_real: *const f64,
    epsilon_x_imaginary: *const f64,
    epsilon_y_real: *const f64,
    epsilon_y_imaginary: *const f64,
    inverse_epsilon_z_real: *const f64,
    inverse_epsilon_z_imaginary: *const f64,
    stretch_x_cell_real: *const f64,
    stretch_x_cell_imaginary: *const f64,
    stretch_x_node_real: *const f64,
    stretch_x_node_imaginary: *const f64,
    stretch_y_cell_real: *const f64,
    stretch_y_cell_imaginary: *const f64,
    stretch_y_node_real: *const f64,
    stretch_y_node_imaginary: *const f64,
) -> u32 {
    let hx_size = ny.saturating_mul(nx.saturating_add(1));
    let hy_size = ny.saturating_add(1).saturating_mul(nx);
    let node_size = ny.saturating_add(1).saturating_mul(nx.saturating_add(1));
    let result = (|| {
        Ok(VectorOperator::new(
            nx,
            ny,
            k0,
            copy_f64(dx_cell, nx)?,
            copy_f64(dy_cell, ny)?,
            copy_f64(dx_dual, nx + 1)?,
            copy_f64(dy_dual, ny + 1)?,
            copy_f64(epsilon_x_real, hy_size)?,
            copy_f64(epsilon_x_imaginary, hy_size)?,
            copy_f64(epsilon_y_real, hx_size)?,
            copy_f64(epsilon_y_imaginary, hx_size)?,
            copy_f64(inverse_epsilon_z_real, node_size)?,
            copy_f64(inverse_epsilon_z_imaginary, node_size)?,
            copy_f64(stretch_x_cell_real, nx)?,
            copy_f64(stretch_x_cell_imaginary, nx)?,
            copy_f64(stretch_x_node_real, nx + 1)?,
            copy_f64(stretch_x_node_imaginary, nx + 1)?,
            copy_f64(stretch_y_cell_real, ny)?,
            copy_f64(stretch_y_cell_imaginary, ny)?,
            copy_f64(stretch_y_node_real, ny + 1)?,
            copy_f64(stretch_y_node_imaginary, ny + 1)?,
            periodic_x != 0,
            bloch_phase_x,
            periodic_y != 0,
            bloch_phase_y,
        )?)
    })();
    set_operator(result.map(CoreOperator::Vector))
}

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub unsafe extern "C" fn configure_tensor_operator(
    nx: usize,
    ny: usize,
    k0: f64,
    dx_cell: *const f64,
    dy_cell: *const f64,
    dx_dual: *const f64,
    dy_dual: *const f64,
    epsilon_xx: *const f64,
    epsilon_yy: *const f64,
    epsilon_zz: *const f64,
    epsilon_xy: *const f64,
    epsilon_xz: *const f64,
    epsilon_yz: *const f64,
) -> u32 {
    let cells = nx.saturating_mul(ny);
    let result = (|| {
        Ok(TensorOperator::new(
            nx,
            ny,
            k0,
            copy_f64(dx_cell, nx)?,
            copy_f64(dy_cell, ny)?,
            copy_f64(dx_dual, nx + 1)?,
            copy_f64(dy_dual, ny + 1)?,
            copy_f64(epsilon_xx, cells)?,
            copy_f64(epsilon_yy, cells)?,
            copy_f64(epsilon_zz, cells)?,
            copy_f64(epsilon_xy, cells)?,
            copy_f64(epsilon_xz, cells)?,
            copy_f64(epsilon_yz, cells)?,
        )?)
    })();
    set_operator(result.map(CoreOperator::Tensor))
}

#[no_mangle]
pub unsafe extern "C" fn configure_sparse_operator(
    size: usize,
    column_pointers: *const u32,
    row_indices: *const u32,
    values_real: *const f64,
    values_imaginary: *const f64,
    nonzeros: usize,
) -> u32 {
    let result = (|| {
        Ok(SparseOperator::new(
            size,
            copy_u32(column_pointers, size + 1)?,
            copy_u32(row_indices, nonzeros)?,
            copy_f64(values_real, nonzeros)?,
            copy_f64(values_imaginary, nonzeros)?,
        )?)
    })();
    set_operator(result.map(CoreOperator::Sparse))
}

#[no_mangle]
pub extern "C" fn operator_physical_size() -> usize {
    OPERATOR.with(|stored| stored.borrow().as_ref().map(CoreOperator::physical_size).unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn operator_vector_size() -> usize {
    OPERATOR.with(|stored| stored.borrow().as_ref().map(CoreOperator::vector_size).unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn operator_is_complex() -> u32 {
    OPERATOR.with(|stored| stored.borrow().as_ref().is_some_and(CoreOperator::is_complex) as u32)
}

#[no_mangle]
pub unsafe extern "C" fn apply_operator(input: *const f64, input_length: usize, output: *mut f64, output_length: usize) -> u32 {
    if output.is_null() {
        return 50;
    }
    let input = match read_f64(input, input_length) {
        Ok(values) => values,
        Err(status) => return status,
    };
    OPERATOR.with(|stored| {
        let stored = stored.borrow();
        let result = match stored.as_ref() {
            Some(operator) => operator.apply(input),
            None => return 51,
        };
        match result {
            Ok(values) if values.len() == output_length => {
                slice::from_raw_parts_mut(output, output_length).copy_from_slice(&values);
                0
            }
            Ok(_) => 52,
            Err(status) => status,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn solve_shifted_operator(
    shift: f64,
    input: *const f64,
    input_length: usize,
    output: *mut f64,
    output_length: usize,
) -> u32 {
    if output.is_null() {
        return 50;
    }
    let input = match read_f64(input, input_length) {
        Ok(values) => values,
        Err(status) => return status,
    };
    OPERATOR.with(|stored| {
        let mut stored = stored.borrow_mut();
        let result = match stored.as_mut() {
            Some(operator) => operator.solve_shifted(shift, input),
            None => return 51,
        };
        match result {
            Ok(values) if values.len() == output_length => {
                slice::from_raw_parts_mut(output, output_length).copy_from_slice(&values);
                0
            }
            Ok(_) => 52,
            Err(status) => status,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn solve_eigenpairs(
    shift: f64,
    arnoldi_dimension: usize,
    requested_pairs: usize,
    initial_vector: *const f64,
    initial_vector_length: usize,
) -> u32 {
    let initial = match read_f64(initial_vector, initial_vector_length) {
        Ok(values) => values,
        Err(status) => return status,
    };
    let result = OPERATOR.with(|stored| {
        let mut stored = stored.borrow_mut();
        match stored.as_mut() {
            Some(operator) => solve_shift_invert_arnoldi(operator, shift, arnoldi_dimension, requested_pairs, initial),
            None => Err(51),
        }
    });
    match result {
        Ok(values) => {
            RESULTS.with(|stored| *stored.borrow_mut() = values);
            0
        }
        Err(status) => {
            RESULTS.with(|stored| stored.borrow_mut().clear());
            status
        }
    }
}

#[no_mangle]
pub extern "C" fn eigenpair_count() -> usize {
    RESULTS.with(|stored| stored.borrow().len())
}

#[no_mangle]
pub extern "C" fn eigenpair_stride() -> usize {
    4 + 2 * operator_physical_size()
}

#[no_mangle]
pub unsafe extern "C" fn copy_eigenpair(index: usize, output: *mut f64, output_length: usize) -> u32 {
    if output.is_null() {
        return 50;
    }
    RESULTS.with(|stored| {
        let stored = stored.borrow();
        let pair = match stored.get(index) {
            Some(pair) => pair,
            None => return 53,
        };
        let expected = 4 + 2 * pair.vector.len();
        if output_length != expected {
            return 52;
        }
        let output = slice::from_raw_parts_mut(output, output_length);
        output[0] = pair.eigenvalue;
        output[1] = pair.eigenvalue_imaginary;
        output[2] = pair.residual;
        output[3] = pair.condition_estimate;
        output[4..4 + pair.vector.len()].copy_from_slice(&pair.vector);
        let imaginary = &mut output[4 + pair.vector.len()..];
        imaginary.fill(0.0);
        if !pair.vector_imaginary.is_empty() {
            imaginary.copy_from_slice(&pair.vector_imaginary);
        }
        0
    })
}

fn set_operator(result: Result<CoreOperator, u32>) -> u32 {
    match result {
        Ok(operator) => {
            OPERATOR.with(|stored| *stored.borrow_mut() = Some(operator));
            RESULTS.with(|stored| stored.borrow_mut().clear());
            0
        }
        Err(status) => status,
    }
}

fn bicgstab<F>(apply: F, shift: f64, right_hand_side: &[f64], maximum_iterations: usize, relative_tolerance: f64) -> Result<Vec<f64>, u32>
where
    F: Fn(&[f64]) -> Result<Vec<f64>, u32>,
{
    let size = right_hand_side.len();
    let mut solution = vec![0.0; size];
    let mut residual = right_hand_side.to_vec();
    let shadow = residual.clone();
    let mut direction = vec![0.0; size];
    let mut operator_direction = vec![0.0; size];
    let mut rho_previous = 1.0;
    let mut alpha = 1.0;
    let mut omega = 1.0;
    let tolerance = relative_tolerance * norm(right_hand_side).max(1.0);

    for _ in 0..maximum_iterations {
        let rho = dot(&shadow, &residual);
        if rho.abs() < 1e-30 {
            break;
        }
        let beta = (rho / rho_previous) * (alpha / omega);
        for index in 0..size {
            direction[index] = residual[index] + beta * (direction[index] - omega * operator_direction[index]);
        }
        operator_direction = apply(&direction)?;
        add_scaled(&mut operator_direction, &direction, -shift);
        let denominator = dot(&shadow, &operator_direction);
        if denominator.abs() < 1e-30 {
            break;
        }
        alpha = rho / denominator;
        let mut intermediate = residual.clone();
        add_scaled(&mut intermediate, &operator_direction, -alpha);
        if norm(&intermediate) <= tolerance {
            add_scaled(&mut solution, &direction, alpha);
            return Ok(solution);
        }
        let mut operator_intermediate = apply(&intermediate)?;
        add_scaled(&mut operator_intermediate, &intermediate, -shift);
        let omega_denominator = dot(&operator_intermediate, &operator_intermediate);
        if omega_denominator < 1e-30 {
            break;
        }
        omega = dot(&operator_intermediate, &intermediate) / omega_denominator;
        add_scaled(&mut solution, &direction, alpha);
        add_scaled(&mut solution, &intermediate, omega);
        residual = intermediate;
        add_scaled(&mut residual, &operator_intermediate, -omega);
        if norm(&residual) <= tolerance {
            return Ok(solution);
        }
        if omega.abs() < 1e-30 {
            break;
        }
        rho_previous = rho;
    }
    Ok(solution)
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

unsafe fn copy_f64(pointer: *const f64, length: usize) -> Result<Vec<f64>, u32> {
    Ok(read_f64(pointer, length)?.to_vec())
}

unsafe fn copy_u32(pointer: *const u32, length: usize) -> Result<Vec<u32>, u32> {
    if pointer.is_null() {
        return Err(50);
    }
    Ok(slice::from_raw_parts(pointer, length).to_vec())
}

unsafe fn read_f64<'a>(pointer: *const f64, length: usize) -> Result<&'a [f64], u32> {
    if pointer.is_null() {
        return Err(50);
    }
    Ok(slice::from_raw_parts(pointer, length))
}
