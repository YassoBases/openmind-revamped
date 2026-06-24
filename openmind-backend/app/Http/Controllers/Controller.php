<?php

namespace App\Http\Controllers;

/**
 * @OA\Info(
 *     title="OpenMind API",
 *     version="1.0.0",
 *     description="API documentation for the OpenMind platform",
 *     @OA\Contact(
 *         name="Support",
 *         email="support@openmind.edu"
 *     )
 * )
 * @OA\Server(
 *     url="/api",
 *     description="Default API Server"
 * )
 * @OA\Tag(
 *     name="Games",
 *     description="Operations related to educational games"
 * )
 * @OA\Tag(
 *     name="Students",
 *     description="Operations related to student profiles and management"
 * )
 * @OA\Tag(
 *     name="Stats",
 *     description="Operations related to student statistics and achievements"
 * )
 * @OA\Tag(
 *     name="System",
 *     description="Operations related to system health and configuration"
 * )
 */
abstract class Controller
{
    //
}
