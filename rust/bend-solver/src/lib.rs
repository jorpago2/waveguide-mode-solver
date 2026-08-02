use faer::{
    c64,
    linalg::solvers::{ShapeCore, Solve},
    sparse::{
        linalg::solvers::{Lu, SymbolicLu},
        SparseColMat, Triplet,
    },
    Mat,
};
use std::{cell::RefCell, mem, slice};

thread_local! {
    static FACTORIZATION: RefCell<Option<Lu<usize, c64>>> = const { RefCell::new(None) };
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
    drop(Vec::from_raw_parts(pointer, 0, capacity));
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
    drop(Vec::from_raw_parts(pointer, 0, capacity));
}

#[no_mangle]
pub unsafe extern "C" fn factorize_shifted(
    size: usize,
    column_pointers: *const u32,
    row_indices: *const u32,
    values_real: *const f64,
    values_imaginary: *const f64,
    nonzeros: usize,
    shift: f64,
) -> u32 {
    if size == 0 || column_pointers.is_null() || row_indices.is_null() || values_real.is_null() || values_imaginary.is_null() {
        return 1;
    }
    let pointers = slice::from_raw_parts(column_pointers, size + 1);
    let rows = slice::from_raw_parts(row_indices, nonzeros);
    let real = slice::from_raw_parts(values_real, nonzeros);
    let imaginary = slice::from_raw_parts(values_imaginary, nonzeros);
    if pointers[size] as usize != nonzeros {
        return 1;
    }

    let mut triplets = Vec::with_capacity(nonzeros + size);
    for column in 0..size {
        let mut diagonal_found = false;
        for entry in pointers[column] as usize..pointers[column + 1] as usize {
            let row = rows[entry] as usize;
            if row >= size {
                return 1;
            }
            let mut value = c64::new(real[entry], imaginary[entry]);
            if row == column {
                value.re -= shift;
                diagonal_found = true;
            }
            triplets.push(Triplet::new(row, column, value));
        }
        if !diagonal_found {
            triplets.push(Triplet::new(column, column, c64::new(-shift, 0.0)));
        }
    }

    let matrix = match SparseColMat::<usize, c64>::try_new_from_triplets(size, size, &triplets) {
        Ok(matrix) => matrix,
        Err(_) => return 2,
    };
    let symbolic = match SymbolicLu::try_new(matrix.symbolic()) {
        Ok(symbolic) => symbolic,
        Err(_) => return 3,
    };
    let factorization = match Lu::try_new_with_symbolic(symbolic, matrix.as_ref()) {
        Ok(factorization) => factorization,
        Err(_) => return 4,
    };
    FACTORIZATION.with(|stored| *stored.borrow_mut() = Some(factorization));
    0
}

#[no_mangle]
pub unsafe extern "C" fn solve_factorized(
    right_real: *const f64,
    right_imaginary: *const f64,
    output_real: *mut f64,
    output_imaginary: *mut f64,
    size: usize,
) -> u32 {
    if right_real.is_null() || right_imaginary.is_null() || output_real.is_null() || output_imaginary.is_null() {
        return 1;
    }
    let right_real = slice::from_raw_parts(right_real, size);
    let right_imaginary = slice::from_raw_parts(right_imaginary, size);
    let output_real = slice::from_raw_parts_mut(output_real, size);
    let output_imaginary = slice::from_raw_parts_mut(output_imaginary, size);

    FACTORIZATION.with(|stored| {
        let stored = stored.borrow();
        let factorization = match stored.as_ref() {
            Some(factorization) if factorization.nrows() == size => factorization,
            _ => return 2,
        };
        let mut right = Mat::<c64>::from_fn(size, 1, |row, _| c64::new(right_real[row], right_imaginary[row]));
        factorization.solve_in_place(right.as_mut());
        for row in 0..size {
            let value = right[(row, 0)];
            output_real[row] = value.re;
            output_imaginary[row] = value.im;
        }
        0
    })
}

#[no_mangle]
pub extern "C" fn clear_factorization() {
    FACTORIZATION.with(|stored| *stored.borrow_mut() = None);
}
