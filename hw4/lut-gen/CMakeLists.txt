cmake_minimum_required(VERSION 3.16)
project(lut-gen)

set(CMAKE_CXX_STANDARD 17)

include_directories(ext)

add_executable(lut-Emu-MC Emu_MC.cpp)
add_executable(lut-Eavg-MC Eavg_MC.cpp)
add_executable(lut-Emu-IS Emu_IS.cpp)
add_executable(lut-Eavg-IS Eavg_IS.cpp)

add_executable(brdf-tests tests.cpp)
add_executable(lut-check lut_check.cpp)
enable_testing()
add_test(NAME brdf-analytic COMMAND brdf-tests)
option(HW4_SANITIZE "Instrument LUT tools and tests" OFF)
if(HW4_SANITIZE)
  foreach(target lut-Emu-MC lut-Eavg-MC lut-Emu-IS lut-Eavg-IS brdf-tests lut-check)
    target_compile_options(${target} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer -fno-pie)
    target_link_options(${target} PRIVATE -fsanitize=address,undefined -no-pie)
  endforeach()
endif()
